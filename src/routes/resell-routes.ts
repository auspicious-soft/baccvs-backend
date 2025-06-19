import { Router } from "express";
import {
  createResellListing,
  getResellListingById,
  getUserResellListings,
  getAllResellListings,
  updateResellListing,
  cancelResellListing,
} from "src/controllers/resell/resell-controller";

const router = Router();

// Create a new resell listing
router.post("/", createResellListing);

// Get a specific resell listing
router.get("/:id", getResellListingById);

// Get all resell listings for the current user
router.get("/user/listings",  getUserResellListings);

// Get all available resell listings (with optional filters)
router.get("/", getAllResellListings);

// Update a resell listing (price only)
router.put("/:id",updateResellListing);

// Cancel a resell listing
router.patch("/:id/cancel",cancelResellListing);


export { router };