import { Router } from 'express';
import { checkAuth } from 'src/middleware/check-auth';
import {
  getNearbyUsers,
  getNearbyEvents,
  updateUserLocation
} from 'src/controllers/location/location-controller';

const router = Router();

router.get('/nearby-users', getNearbyUsers);
router.get('/nearby-events', getNearbyEvents);
router.put('/update-location', updateUserLocation);

export { router };




// Get nearby users within 5km
// GET /api/location/nearby-users?longitude=73.856255&latitude=18.516726&maxDistance=5

// // Get nearby events within 10km
// GET /api/location/nearby-events?longitude=73.856255&latitude=18.516726&maxDistance=10

// // Update user location
// PUT /api/location/update-location
// Body: {
// "longitude": 73.856255,
// "latitude": 18.516726
// }