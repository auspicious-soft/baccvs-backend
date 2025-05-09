import { Router } from "express";
import { createStory, deleteStory, getUserStories, getFollowingStories, viewStory, getStoryById } from "src/controllers/story/story-controller";

const router = Router();

router.post("/", createStory);  // Create a new story
router.get("/user/:userId", getUserStories);  // Get stories of a specific user
router.get("/following", getFollowingStories);  // Get stories of users followed by the current user
router.get("/:storyId", getStoryById);  // Get a specific story by ID
router.patch("/view/:storyId", viewStory);  // Mark a story as viewed by the current user
router.delete("/:storyId", deleteStory);  // Delete a story

export { router };