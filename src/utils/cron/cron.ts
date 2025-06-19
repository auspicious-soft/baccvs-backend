import cron from 'node-cron';
import { DatingSubscription, DatingSubscriptionPlan } from 'src/models/subscriptions/dating-subscription-schema';
import { usersModel } from 'src/models/user/user-schema';


// Cron job: every night at 00:01 am
export const dailySubscriptionCron = cron.schedule('1 0 * * *', async () => {
  console.log('Running cron job every night at 00:01 am');

  try {
    const currentDate = new Date();
    // Find all active subscriptions
    const subscriptions = await DatingSubscription.find({
      isActive: true,
      endDate: { $gte: currentDate }
    });

    for (const subscription of subscriptions) {
      const { user, features } = subscription;
      if (features) {
        // Increment (append) the user's fields by the subscription's features
        await usersModel.findByIdAndUpdate(user, {
          $inc: {
            totalLikes: features.dailyLikes ?? 0,
            totalSuperLikes: features.superLikesPerDay ?? 0,
            totalBoosts: features.boostsPerMonth ?? 0
          }
        });
      }
    }

    console.log(`Updated ${subscriptions.length} users' like/boost features from subscriptions.`);
  } catch (err) {
    console.error('Cron job error:', err);
  }
});
