"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const client_1 = require("@prisma/client");
const authMiddleware_1 = require("../middleware/authMiddleware");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
// Import functions from userController
const userController_1 = require("../controllers/userController");
const prisma = new client_1.PrismaClient();
const router = express_1.default.Router();
// Configure image upload for profile pictures
const profilePicturesDir = path_1.default.join(__dirname, '../../uploads/profile-pictures');
if (!fs_1.default.existsSync(profilePicturesDir)) {
    fs_1.default.mkdirSync(profilePicturesDir, { recursive: true });
}
// Configure upload for seller verification documents
const verificationDocsDir = path_1.default.join(__dirname, '../../uploads/verification-documents');
if (!fs_1.default.existsSync(verificationDocsDir)) {
    fs_1.default.mkdirSync(verificationDocsDir, { recursive: true });
}
const verificationStorage = multer_1.default.diskStorage({
    destination: function (req, file, cb) {
        cb(null, verificationDocsDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = crypto_1.default.randomBytes(16).toString('hex');
        cb(null, uniqueSuffix + path_1.default.extname(file.originalname));
    }
});
const documentUpload = (0, multer_1.default)({
    storage: verificationStorage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        }
        else {
            cb(new Error('Invalid file type. Only JPEG, PNG, GIF, WEBP, and PDF are allowed.'));
        }
    }
});
const profileStorage = multer_1.default.diskStorage({
    destination: function (req, file, cb) {
        cb(null, profilePicturesDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = crypto_1.default.randomBytes(16).toString('hex');
        cb(null, uniqueSuffix + path_1.default.extname(file.originalname));
    }
});
const profileUpload = (0, multer_1.default)({
    storage: profileStorage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        }
        else {
            cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WEBP are allowed.'));
        }
    }
});
// Function to delete profile picture from storage
const deleteProfilePicture = async (fileUrl) => {
    if (!fileUrl)
        return;
    try {
        // Extract the file name from the URL
        const fileName = fileUrl.split('/').pop();
        if (!fileName)
            return;
        // Check for the file in the profile-pictures directory
        const profilePicturesPath = path_1.default.join(__dirname, '../../uploads/profile-pictures', fileName);
        // Delete the file if it exists
        if (fs_1.default.existsSync(profilePicturesPath)) {
            await fs_1.default.promises.unlink(profilePicturesPath);
            console.log(`Deleted profile picture: ${profilePicturesPath}`);
        }
    }
    catch (error) {
        console.error('Error deleting profile picture:', error);
    }
};
// Apply middleware
router.use(authMiddleware_1.authenticate);
// Saved posts route
router.get('/saved-posts', userController_1.getSavedPosts);
// Get follows data (following and followers)
router.get('/follows', userController_1.getUserFollows);
// Upload profile picture
router.post('/upload', profileUpload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        const userId = req.user.id;
        const imageUrl = `/uploads/profile-pictures/${req.file.filename}`;
        // Update user profile with new image
        await prisma.user.update({
            where: { id: userId },
            data: { userImage: imageUrl }
        });
        res.json({
            success: true,
            imageUrl
        });
    }
    catch (error) {
        console.error('Error uploading profile picture:', error);
        res.status(500).json({ error: 'Server error while uploading profile picture' });
    }
});
// Seller verification document upload
router.post('/seller-verification', documentUpload.single('document'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No document uploaded' });
        }
        const userId = req.user.id;
        const documentUrl = `/uploads/verification-documents/${req.file.filename}`;
        // Update user profile with new verification document and set status to PENDING
        await prisma.user.update({
            where: { id: userId },
            data: {
                sellerVerificationDoc: documentUrl,
                isSeller: true,
                sellerStatus: 'PENDING'
            }
        });
        res.json({
            success: true,
            url: documentUrl
        });
    }
    catch (error) {
        console.error('Error uploading verification document:', error);
        res.status(500).json({ error: 'Server error while uploading verification document' });
    }
});
// Cancel seller verification request
router.post('/cancel-seller-verification', async (req, res) => {
    try {
        const userId = req.user.id;
        // Get the current user data to check the document URL
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { sellerVerificationDoc: true }
        });
        // If there's a document, try to delete it from the filesystem
        if (user === null || user === void 0 ? void 0 : user.sellerVerificationDoc) {
            try {
                const fileName = user.sellerVerificationDoc.split('/').pop();
                if (fileName) {
                    const filePath = path_1.default.join(__dirname, '../../uploads/verification-documents', fileName);
                    if (fs_1.default.existsSync(filePath)) {
                        fs_1.default.unlinkSync(filePath);
                        console.log(`Deleted verification document: ${filePath}`);
                    }
                }
            }
            catch (deleteError) {
                console.error('Error deleting verification document:', deleteError);
                // Continue with the update even if deletion fails
            }
        }
        // Update user profile to remove seller status and document
        await prisma.user.update({
            where: { id: userId },
            data: {
                sellerVerificationDoc: null,
                isSeller: false,
                sellerStatus: null
            }
        });
        res.json({
            success: true,
            message: 'Seller verification request cancelled successfully'
        });
    }
    catch (error) {
        console.error('Error cancelling verification request:', error);
        res.status(500).json({ error: 'Server error while cancelling verification request' });
    }
});
// Disable seller mode
router.post('/disable-seller', authMiddleware_1.authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        console.log(`Disabling seller mode for user ID: ${userId}`);
        // Get the current user data to check the document URL
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                isSeller: true,
                sellerStatus: true,
                sellerVerificationDoc: true
            }
        });
        // If user is not a seller or doesn't have seller status, return an error
        if (!(user === null || user === void 0 ? void 0 : user.isSeller)) {
            return res.status(400).json({
                success: false,
                error: 'User is not a seller'
            });
        }
        // If there's a document, try to delete it from the filesystem
        if (user === null || user === void 0 ? void 0 : user.sellerVerificationDoc) {
            try {
                const fileName = user.sellerVerificationDoc.split('/').pop();
                if (fileName) {
                    const filePath = path_1.default.join(__dirname, '../../uploads/verification-documents', fileName);
                    if (fs_1.default.existsSync(filePath)) {
                        fs_1.default.unlinkSync(filePath);
                        console.log(`Deleted verification document: ${filePath}`);
                    }
                }
            }
            catch (deleteError) {
                console.error('Error deleting verification document:', deleteError);
                // Continue with the update even if deletion fails
            }
        }
        // Update user profile to remove seller status and document
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: {
                sellerVerificationDoc: null,
                isSeller: false,
                sellerStatus: null
            },
            select: {
                id: true,
                username: true,
                isSeller: true,
                sellerStatus: true,
                sellerVerificationDoc: true
            }
        });
        console.log(`Updated user:`, updatedUser);
        res.json({
            success: true,
            message: 'Seller mode disabled successfully',
            user: updatedUser
        });
    }
    catch (error) {
        console.error('Error disabling seller mode:', error);
        res.status(500).json({
            success: false,
            error: 'Server error while disabling seller mode'
        });
    }
});
// Get user profile
router.get('/profile/:username', async (req, res) => {
    var _a;
    try {
        const { username } = req.params;
        const currentUserId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const user = await prisma.user.findUnique({
            where: { username },
            select: {
                id: true,
                username: true,
                email: true,
                bio: true,
                userImage: true,
                createdAt: true,
                posts: {
                    orderBy: { createdAt: 'desc' }
                },
                followers: true,
                following: true,
                isSeller: true,
                sellerVerificationDoc: true,
                sellerStatus: true
            }
        });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        // Check if the current user is following this profile
        let isFollowing = false;
        if (currentUserId) {
            const followRecord = await prisma.follows.findUnique({
                where: {
                    followerId_followingId: {
                        followerId: currentUserId,
                        followingId: Number(user.id)
                    }
                }
            });
            isFollowing = !!followRecord;
        }
        const userProfile = Object.assign(Object.assign({}, user), { followersCount: Array.isArray(user.followers) ? user.followers.length : 0, followingCount: Array.isArray(user.following) ? user.following.length : 0, isFollowing });
        res.json(userProfile);
    }
    catch (error) {
        console.error('Error fetching user profile:', error);
        res.status(500).json({ error: 'Failed to fetch user profile' });
    }
});
// Search users by username or email
router.get('/search', async (req, res) => {
    try {
        const { query } = req.query;
        if (!query || typeof query !== 'string') {
            return res.status(400).json({ error: 'Search query is required' });
        }
        console.log('Searching users with query:', query);
        const searchTerm = query.toLowerCase();
        // First, get all matching users
        const users = await prisma.user.findMany({
            where: {
                AND: [
                    { role: 'USER' },
                    {
                        OR: [
                            { username: { contains: searchTerm } },
                            { email: { contains: searchTerm } }
                        ]
                    }
                ]
            },
            select: {
                id: true,
                username: true,
                email: true,
                role: true,
                userImage: true
            },
            take: 10
        });
        // Sort results by relevance:
        // 1. Username starts with search term
        // 2. Email starts with search term
        // 3. Username contains search term
        // 4. Email contains search term
        const sortedUsers = users.sort((a, b) => {
            const aUsername = a.username.toLowerCase();
            const bUsername = b.username.toLowerCase();
            const aEmail = a.email.toLowerCase();
            const bEmail = b.email.toLowerCase();
            // Check if usernames start with search term
            const aStartsWithUsername = aUsername.startsWith(searchTerm);
            const bStartsWithUsername = bUsername.startsWith(searchTerm);
            if (aStartsWithUsername && !bStartsWithUsername)
                return -1;
            if (!aStartsWithUsername && bStartsWithUsername)
                return 1;
            // If both or neither username starts with search term, check email
            const aStartsWithEmail = aEmail.startsWith(searchTerm);
            const bStartsWithEmail = bEmail.startsWith(searchTerm);
            if (aStartsWithEmail && !bStartsWithEmail)
                return -1;
            if (!aStartsWithEmail && bStartsWithEmail)
                return 1;
            // If still tied, sort alphabetically by username
            return aUsername.localeCompare(bUsername);
        });
        console.log(`Found ${sortedUsers.length} users matching query:`, sortedUsers);
        res.json(sortedUsers);
    }
    catch (error) {
        console.error('Error searching users:', error);
        res.status(500).json({ error: 'Failed to search users' });
    }
});
// Get suggested users
router.get('/suggestions', async (req, res) => {
    try {
        const userId = req.user.id;
        // Find users that the current user follows
        const following = await prisma.follows.findMany({
            where: {
                followerId: userId
            },
            select: {
                followingId: true
            }
        });
        const followingIds = following.map(f => f.followingId);
        if (followingIds.length === 0) {
            // If user doesn't follow anyone, return random users
            const randomUsers = await prisma.user.findMany({
                where: {
                    id: { not: userId }, // Exclude current user
                    role: 'USER'
                },
                select: {
                    id: true,
                    username: true,
                    email: true,
                    userImage: true,
                    role: true
                },
                take: 5,
                orderBy: {
                    createdAt: 'desc'
                }
            });
            return res.json(randomUsers);
        }
        // Find users that the current user's followings follow, but the current user doesn't follow
        const suggestedUsers = await prisma.follows.findMany({
            where: {
                followerId: { in: followingIds },
                followingId: {
                    not: userId, // Exclude current user
                    notIn: followingIds
                }
            },
            select: {
                following: {
                    select: {
                        id: true,
                        username: true,
                        email: true,
                        userImage: true,
                        role: true
                    }
                }
            },
            distinct: ['followingId']
        });
        // Extract and filter users with USER role
        const users = suggestedUsers
            .map(su => su.following)
            .filter(user => user.role === 'USER' && user.id !== userId); // Additional check to filter out current user
        // If not enough suggestions, add some random users not followed
        if (users.length < 5) {
            const randomUsers = await prisma.user.findMany({
                where: {
                    id: {
                        not: userId, // Exclude current user
                        notIn: [...followingIds, ...users.map(u => u.id)]
                    },
                    role: 'USER'
                },
                select: {
                    id: true,
                    username: true,
                    email: true,
                    userImage: true,
                    role: true
                },
                take: 5 - users.length
            });
            users.push(...randomUsers);
        }
        res.json(users);
    }
    catch (error) {
        console.error('Error fetching suggested users:', error);
        res.status(500).json({ error: 'Failed to fetch suggested users' });
    }
});
// Get user follows data
router.get('/follow/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const currentUserId = req.user.id;
        // Check if the user is following the target user
        const followRecord = await prisma.follows.findUnique({
            where: {
                followerId_followingId: {
                    followerId: currentUserId,
                    followingId: Number(userId)
                }
            }
        });
        res.json({
            isFollowing: !!followRecord
        });
    }
    catch (error) {
        console.error('Error getting follow data:', error);
        res.status(500).json({ error: 'Failed to get follow data' });
    }
});
// Follow a user
router.post('/follow/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const followerId = req.user.id;
        // Check if already following
        const existingFollow = await prisma.follows.findUnique({
            where: {
                followerId_followingId: {
                    followerId,
                    followingId: Number(userId)
                }
            }
        });
        if (existingFollow) {
            return res.status(400).json({ error: 'Already following this user' });
        }
        // Create follow relationship
        await prisma.follows.create({
            data: {
                followerId,
                followingId: Number(userId)
            }
        });
        res.status(200).json({ message: 'Successfully followed user' });
    }
    catch (error) {
        console.error('Error following user:', error);
        res.status(500).json({ error: 'Failed to follow user' });
    }
});
// Unfollow a user
router.delete('/follow/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const followerId = req.user.id;
        // Delete follow relationship
        await prisma.follows.delete({
            where: {
                followerId_followingId: {
                    followerId,
                    followingId: Number(userId)
                }
            }
        });
        res.status(200).json({ message: 'Successfully unfollowed user' });
    }
    catch (error) {
        console.error('Error unfollowing user:', error);
        res.status(500).json({ error: 'Failed to unfollow user' });
    }
});
// Get user profile followers
router.get('/profile/:username/followers', async (req, res) => {
    try {
        const { username } = req.params;
        // Find the user first
        const user = await prisma.user.findUnique({
            where: { username }
        });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        // Get followers for this user
        const followers = await prisma.follows.findMany({
            where: {
                followingId: user.id
            },
            include: {
                follower: {
                    select: {
                        id: true,
                        username: true,
                        userImage: true,
                        role: true
                    }
                }
            }
        });
        const followersList = followers.map(follow => follow.follower);
        res.json(followersList);
    }
    catch (error) {
        console.error('Error fetching followers:', error);
        res.status(500).json({ error: 'Failed to fetch followers' });
    }
});
// Get user profile following
router.get('/profile/:username/following', async (req, res) => {
    try {
        const { username } = req.params;
        // Find the user first
        const user = await prisma.user.findUnique({
            where: { username }
        });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        // Get users that this user follows
        const following = await prisma.follows.findMany({
            where: {
                followerId: user.id
            },
            include: {
                following: {
                    select: {
                        id: true,
                        username: true,
                        userImage: true,
                        role: true
                    }
                }
            }
        });
        const followingList = following.map(follow => follow.following);
        res.json(followingList);
    }
    catch (error) {
        console.error('Error fetching following:', error);
        res.status(500).json({ error: 'Failed to fetch following' });
    }
});
// Get user by username
router.get('/username/:username', async (req, res) => {
    try {
        const { username } = req.params;
        const user = await prisma.user.findUnique({
            where: { username },
            select: {
                id: true,
                username: true,
                userImage: true,
                bio: true
            }
        });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(user);
    }
    catch (error) {
        console.error('Error finding user by username:', error);
        res.status(500).json({ error: 'Failed to find user' });
    }
});
// Get user seller status by ID
router.get('/status/:userId', authMiddleware_1.authenticate, async (req, res) => {
    try {
        const { userId } = req.params;
        console.log(`Fetching seller status for user ID: ${userId}`);
        const user = await prisma.user.findUnique({
            where: { id: parseInt(userId) },
            select: {
                id: true,
                isSeller: true,
                sellerStatus: true,
                sellerVerificationDoc: true
            }
        });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        console.log(`User seller status:`, user);
        res.json({
            isSeller: user.isSeller || false,
            sellerStatus: user.sellerStatus,
            sellerVerificationDoc: user.sellerVerificationDoc
        });
    }
    catch (error) {
        console.error('Error fetching user seller status:', error);
        res.status(500).json({ error: 'Failed to fetch user seller status' });
    }
});
// Update user profile
router.put('/profile', async (req, res) => {
    try {
        const userId = req.user.id;
        const { username, bio, userImage, currentPassword, newPassword, isSeller, sellerVerificationDoc, sellerStatus } = req.body;
        console.log('Profile update request for user:', userId);
        console.log('Update data:', {
            username,
            bio,
            userImage: userImage ? '(image url)' : null,
            hasPassword: !!newPassword,
            isSeller,
            sellerStatus
        });
        // Check if username already exists for a different user
        if (username) {
            const existingUser = await prisma.user.findUnique({
                where: { username }
            });
            if (existingUser && existingUser.id !== userId) {
                return res.status(400).json({ error: 'Username already taken' });
            }
        }
        // Prepare update data
        const updateData = {};
        if (username)
            updateData.username = username;
        if (bio !== undefined)
            updateData.bio = bio;
        if (userImage !== undefined)
            updateData.userImage = userImage;
        if (isSeller !== undefined)
            updateData.isSeller = isSeller;
        if (sellerVerificationDoc !== undefined)
            updateData.sellerVerificationDoc = sellerVerificationDoc;
        if (sellerStatus !== undefined)
            updateData.sellerStatus = sellerStatus;
        // If changing password
        if (newPassword) {
            if (!currentPassword) {
                return res.status(400).json({ error: 'Current password is required' });
            }
            // Get the current user with password
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { passwordHash: true }
            });
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }
            // Verify current password (using bcrypt or whatever method you use)
            const crypto = require('crypto');
            const hashedCurrentPassword = crypto
                .createHash('sha256')
                .update(currentPassword)
                .digest('hex');
            if (hashedCurrentPassword !== user.passwordHash) {
                return res.status(401).json({ error: 'Current password is incorrect' });
            }
            // Hash the new password
            const hashedNewPassword = crypto
                .createHash('sha256')
                .update(newPassword)
                .digest('hex');
            updateData.passwordHash = hashedNewPassword;
        }
        // Update user
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: updateData,
            select: {
                id: true,
                username: true,
                email: true,
                bio: true,
                userImage: true,
                role: true,
                isSeller: true,
                sellerVerificationDoc: true,
                sellerStatus: true
            }
        });
        res.json({
            message: 'Profile updated successfully',
            user: updatedUser
        });
    }
    catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});
exports.default = router;
