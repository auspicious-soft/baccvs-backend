import { Request, Response } from "express";
import { JwtPayload } from "jsonwebtoken";
import mongoose from "mongoose";
import { httpStatusCode } from "src/lib/constant";
import { errorResponseHandler } from "src/lib/errors/error-response-handler";
import { purchaseModel } from "src/models/purchase/purchase-schema";
import { transferModel } from "src/models/transfer/transfer-schema";
import QRCode from "qrcode";
import { usersModel } from "src/models/user/user-schema";

export const transferTicketService = async (req: Request, res: Response) => {
  const { id: userId } = req.user as JwtPayload;
  const {
    purchaseId,
    receiverUserId,
    transferType = "all",
    quantity,
  } = req.body;

  // normalize quantity to number when provided
  const quantityNum = quantity !== undefined ? Number(quantity) : undefined;

  // Validation
  if (!purchaseId || !receiverUserId) {
    return errorResponseHandler(
      "Missing required fields: purchaseId and receiverUserId are required",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  if (userId === receiverUserId) {
    return errorResponseHandler(
      "Cannot transfer tickets to yourself",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  if (transferType === "quantity" && (!quantityNum || quantityNum < 1)) {
    return errorResponseHandler(
      "Quantity must be at least 1 when transferType is 'quantity'",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Verify original purchase
    const originalPurchase = await purchaseModel
      .findById(purchaseId)
      .populate("event")
      .populate("ticket")
      .session(session);

    if (!originalPurchase) {
      await session.abortTransaction();
      return errorResponseHandler(
        "Purchase not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    // Check ownership
    if (originalPurchase.buyer.toString() !== userId) {
      await session.abortTransaction();
      return errorResponseHandler(
        "You can only transfer tickets that you own",
        httpStatusCode.FORBIDDEN,
        res
      );
    }

    // Check if purchase is active
    if (originalPurchase.status !== "active") {
      await session.abortTransaction();
      return errorResponseHandler(
        `Cannot transfer tickets with status: ${originalPurchase.status}`,
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Verify receiver exists
    const receiver = await usersModel.findById(receiverUserId).session(session);
    if (!receiver) {
      await session.abortTransaction();
      return errorResponseHandler(
        "Receiver user not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    // Determine transfer quantity
    let transferQuantity = originalPurchase.quantity;
    if (transferType === "quantity") {
      if ((quantityNum as number) > originalPurchase.quantity) {
        await session.abortTransaction();
        return errorResponseHandler(
          `You only have ${originalPurchase.quantity} tickets available to transfer`,
          httpStatusCode.BAD_REQUEST,
          res
        );
      }
      transferQuantity = quantityNum as number;
    }

    // Generate QR code for new purchase
    const newPurchaseId = new mongoose.Types.ObjectId();
    const qrCode = await QRCode.toString(
      `purchase:${newPurchaseId.toString()}`,
      {
        type: "svg",
      }
    );

    // Create new purchase for receiver
    const newPurchaseData = {
      _id: newPurchaseId,
      ticket: originalPurchase.ticket._id.toString(),
      event: originalPurchase.event._id.toString(),
      buyer: receiverUserId,
      quantity: transferQuantity,
      totalPrice: 0, // Transferred tickets have no cost
      qrCode: qrCode,
      isActive: true,
      isResale: false,
      status: "active",
      purchaseDate: new Date(),
      purchaseType: "transfer",
      metaData: {
        originalPurchaseId: originalPurchase._id,
        transferDate: new Date(),
      },
    };

    const [newPurchase] = await purchaseModel.create([newPurchaseData], {
      session,
    });

    // Update original purchase
    if (
      transferType === "all" ||
      transferQuantity === originalPurchase.quantity
    ) {
      // Transfer all tickets - mark original as transferred
      originalPurchase.status = "transferred";
      originalPurchase.isActive = false;
      originalPurchase.quantity = 0;
      // quantity 0 violates schema min validation; skip validators when saving
      await originalPurchase.save({ session, validateBeforeSave: false });
    } else {
      // Partial transfer - reduce quantity
      originalPurchase.quantity -= transferQuantity;
      await originalPurchase.save({ session });
    }

    // Create transfer record
    const transferRecord = await transferModel.create(
      [
        {
          originalPurchase: purchaseId,
          sender: userId,
          receiver: receiverUserId,
          event: originalPurchase.event,
          ticket: originalPurchase.ticket,
          transferType: transferType,
          quantity: transferQuantity,
          newPurchase: newPurchase._id,
          status: "completed",
          completedDate: new Date(),
        },
      ],
      { session }
    );

    await session.commitTransaction();

    return {
      success: true,
      message: `Successfully transferred ${transferQuantity} ticket(s)`,
      data: {
        transfer: transferRecord[0],
        newPurchase: newPurchase,
        remainingTickets: originalPurchase.quantity,
      },
    };
  } catch (error) {
    await session.abortTransaction();
    console.error("Transfer error:", error);
    return errorResponseHandler(
      `Failed to transfer tickets: ${(error as Error).message}`,
      httpStatusCode.INTERNAL_SERVER_ERROR,
      res
    );
  } finally {
    session.endSession();
  }
};

// ============================================
// 3. GET TRANSFER HISTORY SERVICE
// ============================================

export const getTransferHistoryService = async (
  req: Request,
  res: Response
) => {
  const { id: userId } = req.user as JwtPayload;
  const { type = "all" } = req.query; // 'sent', 'received', or 'all'

  try {
    let query: any = {};

    if (type === "sent") {
      query.sender = userId;
    } else if (type === "received") {
      query.receiver = userId;
    } else {
      query = {
        $or: [{ sender: userId }, { receiver: userId }],
      };
    }

    const transfers = await transferModel
      .find(query)
      .populate("sender", "userName email")
      .populate("receiver", "userName email")
      .populate("event", "title date venue startTime")
      .populate("ticket", "name price")
      .populate("originalPurchase")
      .populate("newPurchase")
      .sort({ createdAt: -1 });

    return {
      success: true,
      message: "Transfer history retrieved successfully",
      data: transfers,
    };
  } catch (error) {
    console.error("Get transfer history error:", error);
    return errorResponseHandler(
      `Failed to retrieve transfer history: ${(error as Error).message}`,
      httpStatusCode.INTERNAL_SERVER_ERROR,
      res
    );
  }
};

// ============================================
// 4. CANCEL TRANSFER SERVICE (Optional)
// ============================================

export const cancelTransferService = async (req: Request, res: Response) => {
  const { id: userId } = req.user as JwtPayload;
  const { transferId } = req.params;

  if (!transferId) {
    return errorResponseHandler(
      "Transfer ID is required",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const transfer = await transferModel.findById(transferId).session(session);

    if (!transfer) {
      await session.abortTransaction();
      return errorResponseHandler(
        "Transfer not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    // Only sender can cancel
    if (transfer.sender.toString() !== userId) {
      await session.abortTransaction();
      return errorResponseHandler(
        "Only the sender can cancel a transfer",
        httpStatusCode.FORBIDDEN,
        res
      );
    }

    // Can only cancel if still pending or within certain timeframe
    if (transfer.status !== "pending") {
      await session.abortTransaction();
      return errorResponseHandler(
        "Can only cancel pending transfers",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Revert the transfer
    const originalPurchase = await purchaseModel
      .findById(transfer.originalPurchase)
      .session(session);

    if (originalPurchase) {
      originalPurchase.quantity += transfer.quantity;
      originalPurchase.status = "active";
      originalPurchase.isActive = true;
      await originalPurchase.save({ session });
    }

    // Delete the new purchase
    if (transfer.newPurchase) {
      await purchaseModel
        .findByIdAndDelete(transfer.newPurchase)
        .session(session);
    }

    // Update transfer status
    transfer.status = "rejected";
    await transfer.save({ session });

    await session.commitTransaction();

    return {
      success: true,
      message: "Transfer cancelled successfully",
      data: transfer,
    };
  } catch (error) {
    await session.abortTransaction();
    console.error("Cancel transfer error:", error);
    return errorResponseHandler(
      `Failed to cancel transfer: ${(error as Error).message}`,
      httpStatusCode.INTERNAL_SERVER_ERROR,
      res
    );
  } finally {
    session.endSession();
  }
};
