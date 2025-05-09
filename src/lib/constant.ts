export const httpStatusCode = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
}

export enum Gender {
  MALE = 'male',
  FEMALE = 'female',
  OTHER = 'other'
}

export enum Interest {
  MALE = 'male',
  FEMALE = 'female',
  EVERYONE = 'everyone'
}

export enum PostType {
  ORIGINAL = 'original',
  REPOST = 'repost'
}

export enum PostVisibility {
  PUBLIC = 'public',
  FOLLOWERS = 'followers',
  MATCHES = 'matches'
}

export const MusicType = {
  DISCO_FUNK_SOUL: 'Disco/Funk/Soul',
  UNDERGROUND: 'Underground',
  EDM_DANCE: 'EDM/Dance music',
  HIP_HOP_RNB: 'Hip-Hop/R&B',
  COMMERCIAL: 'Commercial',
  LATIN_REGGAETON: 'Latin/Reggaeton',
  POP_ROCK: 'Pop/Rock',
  TECH_HOUSE: 'Tech-House',
  SEVENTIES: '70s',
  OTHER: 'Other'
};

export const EventType = {
  PREGAME: 'Pregame',
  AFTERPARTY: 'Afterparty',
  PARTY: 'Party',
  CONCERT: 'Concert',
  FESTIVAL: 'Festival',
  RAVE: 'Rave',
  NIGHTCLUB: 'Nightclub',
  THEMED_NIGHT: 'Themed night',
  VIP_EVENTS: 'VIP Events',
  OTHER: 'Other'
};

export const VenueType = {
  NIGHTCLUB: 'Nightclub',
  BAR: 'Bar',
  ROOFTOP: 'Rooftop',
  LOUNGE: 'Lounge',
  RESTAURANT: 'Restaurant',
  HOUSE: 'House',
  APARTMENT: 'Apartment',
  OUTDOOR: 'Outdoor',
  WAREHOUSE: 'Warehouse',
  OTHER: 'Other'
};

export const EventVisibility = {
  PUBLIC: 'public',
  PRIVATE: 'private'
};

export enum FollowRelationshipStatus {
  PENDING = "PENDING",
  FOLLOWING = "FOLLOWING",
  UNFOLLOWED = "UNFOLLOWED"
}

export const priceIdsMap = {
  'free': process.env.STRIPE_PRICE_FREE as string,
  'intro': process.env.STRIPE_PRICE_INTRO as string,
  'pro': process.env.STRIPE_PRICE_PRO as string
}

export const yearlyPriceIdsMap = {
  'intro': process.env.STRIPE_YEARLY_PRICE_INTRO as string,
  'pro': process.env.STRIPE_YEARLY_PRICE_PRO as string
}

export const creditCounts = {
  'free': 24,
  'intro': 90,
  'pro': 180
}

export const yearlyCreditCounts = {
  'intro': 1080,
  'pro': 2160
}
