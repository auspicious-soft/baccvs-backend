// import cron from 'node-cron';
// import { Conversation } from 'src/models/chat/conversation-schema';
// import { usersModel } from 'src/models/user/user-schema';


// // Cron job: every night at 00:01 am
// export const dailySubscriptionCron = cron.schedule('1 0 * * *', async () => {
//   console.log('Running cron job every night at 00:01 am');

//   try {
//     const currentDate = new Date();
//     // Find all active subscriptions
//     const subscriptions = await DatingSubscription.find({
//       isActive: true,
//       endDate: { $gte: currentDate }
//     });

//     for (const subscription of subscriptions) {
//       const { user, features } = subscription;
//       if (features) {
//         // Increment (append) the user's fields by the subscription's features
//         await usersModel.findByIdAndUpdate(user, {
//           $inc: {
//             totalLikes: features.dailyLikes ?? 0,
//             totalSuperLikes: features.superLikesPerDay ?? 0,
//             totalBoosts: features.boostsPerMonth ?? 0
//           }
//         });
//       }
//     }

//     console.log(`Updated ${subscriptions.length} users' like/boost features from subscriptions.`);
//   } catch (err) {
//     console.error('Cron job error:', err);
//   }
// });
// export const startMuteCleanupJob = () => {
//   cron.schedule("0 * * * *", async () => {
//     console.log("[Cron] Starting optimized mute cleanup...");

//     // Step 1: Find conversations that *might* have expired mutes
//     // We can’t directly query inside a Map, but we can limit scope
//     const conversations = await Conversation.find(
//       { "isMuted": { $exists: true, $ne: {} } },
//       { isMuted: 1 } // fetch only relevant field
//     ).lean();

//     let updatedCount = 0;

//     // Step 2: Loop through conversations
//     for (const convo of conversations) {
//       const updatedMuteMap: Record<string, any> = {};
//       let changed = false;

//       // Go through each user’s mute data
//       for (const [userId, muteData] of Object.entries(convo.isMuted)) {
//         if (
//           muteData?.muted &&
//           muteData?.muteExpiresAt &&
//           new Date(muteData.muteExpiresAt) < new Date()
//         ) {
//           updatedMuteMap[userId] = {
//             muted: false,
//             muteExpiresAt: null,
//             muteType: null
//           };
//           changed = true;
//         }
//       }

//       // Step 3: Update only if needed
//       if (changed) {
//         await Conversation.updateOne(
//           { _id: convo._id },
//           { 
//             $set: Object.fromEntries(
//               Object.entries(updatedMuteMap).map(([userId, data]) => [
//                 `isMuted.${userId}`, data
//               ])
//             )
//           }
//         );
//         updatedCount++;
//       }
//     }

//     console.log(`[Cron] Mute cleanup done. Updated ${updatedCount} conversations.`);
//   });
// };