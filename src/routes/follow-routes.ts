import { Router } from "express";
import {  followUser } from "src/controllers/follow/follow";

const router = Router()

router.post("/:targetUserId", followUser);




// router.post('/request/:requestId', handleFollowRequest);  since we're updating the request status
// router.get('/pending', getPendingFollowRequest);
// router.put('/:targetUserId', unfollowUser);
// router.delete('/cancel/:id', cancelFollowRequest);

export { router };
