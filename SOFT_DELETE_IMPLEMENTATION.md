# Soft Delete User Implementation

## Overview

Implemented soft delete functionality for user accounts with three components: schema modification, service layer, controller, and routing.

## Components Implemented

### 1. User Schema (Already Added)

**File**: [src/models/user/user-schema.ts](src/models/user/user-schema.ts#L249)

```typescript
status: {
  type: String,
  enum: ["active", "deleted"],
  default: "active"
}
```

- Added `status` field to user schema with enum validation
- Default value: "active"
- Supports soft delete pattern without data loss

---

### 2. Delete User Service

**File**: [src/uploads/user/user.ts](src/uploads/user/user.ts#L3212)

**Function**: `deleteUserService(req: any, res: Response)`

#### Features:

- Validates user exists and retrieves from database
- Checks if user is already deleted to prevent duplicate deletion
- Updates user status to "deleted" (soft delete)
- Clears sensitive data:
  - password
  - token
  - tempEmail
  - tempPhoneNumber
  - All notification settings
- Returns structured response with userId, status, and deletedAt timestamp
- Follows service pattern with error handling using plain objects

#### Response Format:

```typescript
{
  success: true,
  message: "User account deleted successfully",
  data: {
    userId: "user_id_here",
    status: "deleted",
    deletedAt: "2024-01-15T10:30:00.000Z"
  }
}
```

---

### 3. Delete User Controller

**File**: [src/controllers/user/user.ts](src/controllers/user/user.ts#L630)

**Function**: `deleteUser(req: Request, res: Response)`

#### Features:

- Calls deleteUserService
- Implements response-already-sent check to prevent double-response errors
- Proper error handling using errorParser utility
- HTTP status code handling (defaults to 200 OK on success, 500 on error)
- Comprehensive error logging

#### Response Handling:

- Success: Returns response code and user deletion details
- Error: Returns 500 or custom error code with error message

---

### 4. Route & Endpoint

**File**: [src/routes/user.ts](src/routes/user.ts#L296)

```typescript
router.delete("/delete", checkAuth, deleteUser);
```

#### Route Details:

- **Endpoint**: `DELETE /api/user/delete`
- **Middleware**: `checkAuth` (JWT authentication required)
- **Authentication**: Requires valid JWT token in Authorization header
- **User ID**: Extracted from authenticated user object (`req.user.id`)

#### Usage:

```bash
DELETE /api/user/delete
Authorization: Bearer <jwt_token>
```

---

## Implementation Features

✅ **Soft Delete Pattern**

- User data preserved in database with `status: "deleted"`
- User records not removed, only marked as inactive
- Allows for potential account recovery within 30-day window

✅ **Data Security**

- Sensitive data cleared: passwords, tokens, temp emails, temp phone numbers
- All notification preferences disabled
- User-identifying info still available for audit/recovery purposes

✅ **Error Handling**

- Validates user existence
- Prevents double-deletion
- Consistent error response format
- Prevents double-response errors

✅ **Authentication**

- JWT middleware applied
- Only authenticated users can delete their own account
- User ID extracted from JWT payload

---

## Next Steps (Recommended)

### 1. Query Filters (High Priority)

Update all user queries throughout the application to filter out deleted users:

```typescript
// Pattern to use in services:
usersModel.find({ status: "active", ... })
```

**Files that need updates:**

- [src/services/user/getUserInfoService.ts](src/services/user/user.ts)
- [src/services/chat/\*](src/services/chat/)
- [src/services/follow/\*](src/services/follow/)
- [src/services/post/\*](src/services/post/)
- Any other user-related queries

### 2. Scheduled Hard Delete (Medium Priority)

Create a cron job to permanently delete users after 30 days:

```typescript
// In utils/cron/deleteExpiredAccounts.ts
export const hardDeleteExpiredAccounts = async () => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  await usersModel.deleteMany({
    status: "deleted",
    updatedAt: { $lt: thirtyDaysAgo },
  });
};
```

### 3. Account Recovery Endpoint (Low Priority)

Implement account reactivation within 30-day grace period:

```typescript
export const reactivateUserService = async (req: any, res: Response) => {
  const { id: userId } = req.user;
  const user = await usersModel.findByIdAndUpdate(
    userId,
    { status: "active" },
    { new: true }
  );
  // ... return response
};
```

### 4. Testing

- Test soft delete endpoint with valid JWT
- Test with invalid/expired token
- Test duplicate delete attempt
- Test that deleted users don't appear in searches/feeds
- Verify sensitive data is cleared

---

## Files Modified

1. ✅ [src/models/user/user-schema.ts](src/models/user/user-schema.ts) - Added status field
2. ✅ [src/uploads/user/user.ts](src/uploads/user/user.ts) - Added deleteUserService
3. ✅ [src/controllers/user/user.ts](src/controllers/user/user.ts) - Added deleteUser controller
4. ✅ [src/routes/user.ts](src/routes/user.ts) - Added route and imported deleteUser

---

## Technical Details

**Soft Delete Strategy**:

- Data preservation: All user data remains in database
- Status flag: Users marked as "deleted" instead of removed
- Grace period: 30 days before hard delete (recommended)
- Reversible: Accounts can be reactivated during grace period

**Security Measures**:

- Password hash cleared
- Authentication tokens cleared
- Temporary email/phone cleared
- All notification subscriptions disabled
- User still identifiable for audit purposes

**API Contract**:

- Input: None (extracts user from JWT)
- Output: User ID, new status, deletion timestamp
- Errors: 400 (already deleted), 404 (not found), 500 (server error)

---

## Testing the Implementation

```bash
# Make a DELETE request with valid JWT
curl -X DELETE http://localhost:3000/api/user/delete \
  -H "Authorization: Bearer <your_jwt_token>" \
  -H "Content-Type: application/json"

# Expected Response (Success):
{
  "success": true,
  "message": "User account deleted successfully",
  "data": {
    "userId": "507f1f77bcf86cd799439011",
    "status": "deleted",
    "deletedAt": "2024-01-15T10:30:00.000Z"
  }
}

# Expected Response (Already Deleted):
{
  "success": false,
  "message": "User account is already deleted",
  "code": 400
}

# Expected Response (User Not Found):
{
  "success": false,
  "message": "User not found",
  "code": 404
}
```

---

## Database Impact

**Before Deletion**:

```javascript
{
  _id: ObjectId("507f1f77bcf86cd799439011"),
  email: "user@example.com",
  userName: "john_doe",
  password: "$2b$10$hashedPassword...",
  status: "active",
  createdAt: ISODate("2023-01-01T00:00:00.000Z"),
  updatedAt: ISODate("2024-01-15T10:30:00.000Z")
}
```

**After Soft Delete**:

```javascript
{
  _id: ObjectId("507f1f77bcf86cd799439011"),
  email: "user@example.com",
  userName: "john_doe",
  password: null,
  token: null,
  tempEmail: null,
  tempPhoneNumber: null,
  status: "deleted",
  pushNotification: false,
  newsLetterNotification: false,
  eventsNotification: false,
  chatNotification: false,
  createdAt: ISODate("2023-01-01T00:00:00.000Z"),
  updatedAt: ISODate("2024-01-15T10:30:00.000Z")
}
```

---

## Conclusion

✅ **Soft delete implementation complete** with:

- Schema field for status tracking
- Service layer with validation
- Controller with error handling
- Secure API endpoint with JWT protection
- Ready for integration with query filters
