import { Request, Response } from "express"
import { httpStatusCode } from "src/lib/constant"
import { errorParser } from "src/lib/errors/error-response-handler"
import { getPurchaseTicketsService, purchaseTicketService } from "src/services/purchase/purchase-service"

export const purchaseTicket = async (req: Request, res: Response) =>{
  try {
     const response: any = await purchaseTicketService(req, res)
            return res.status(httpStatusCode.CREATED).json(response)
  } catch (error) {
      const { code, message } = errorParser(error)
          return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" })
    }
}
export const getPurchaseTickets = async (req: Request, res: Response) =>{
  try {
     const response: any = await getPurchaseTicketsService(req, res)
            return res.status(httpStatusCode.OK).json(response)
  } catch (error) {
      const { code, message } = errorParser(error)
          return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" })
    }
}