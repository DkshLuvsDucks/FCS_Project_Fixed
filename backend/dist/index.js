"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const express_rate_limit_1 = require("express-rate-limit");
const path_1 = __importDefault(require("path"));
// Import routes
const routes_1 = __importDefault(require("./routes"));
const security_1 = require("./middleware/security");
// Load environment variables
dotenv_1.default.config();
const app = (0, express_1.default)();
// Configure CORS
app.use((0, cors_1.default)({
    origin: 'http://127.0.0.1:5173', // Updated to HTTP and 127.0.0.1
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express_1.default.json());
// SQL Injection protection middleware - apply to all API routes
app.use('/api', security_1.sqlInjectionFilter);
// Add middleware to properly parse form values
app.use((req, res, next) => {
    // Handle form data boolean values correctly
    if (req.body && typeof req.body === 'object') {
        for (const key in req.body) {
            if (req.body[key] === 'true') {
                req.body[key] = true;
            }
            else if (req.body[key] === 'false') {
                req.body[key] = false;
            }
        }
    }
    next();
});
// Remove sensitive headers
app.disable('x-powered-by');
// Rate limiting configuration
const loginLimiter = (0, express_rate_limit_1.rateLimit)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    message: 'Too many login attempts. Please wait before trying again.',
    standardHeaders: true,
    legacyHeaders: false,
});
const apiLimiter = (0, express_rate_limit_1.rateLimit)({
    windowMs: 60 * 1000, // 1 minute
    max: 500,
    message: 'Too many requests, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method === 'GET'
});
const profileLimiter = (0, express_rate_limit_1.rateLimit)({
    windowMs: 60 * 1000, // 1 minute
    max: 300,
    message: 'Too many profile requests, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method === 'GET'
});
// Apply rate limiters to specific routes
app.use('/api/auth/login', loginLimiter);
app.use('/api/users/upload', profileLimiter);
app.use('/api/users/search', apiLimiter);
// General limiter
const generalLimiter = (0, express_rate_limit_1.rateLimit)({
    windowMs: 60 * 1000,
    max: 1000,
    message: 'Too many requests, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method === 'GET'
});
app.use(generalLimiter);
// Security headers
app.use(security_1.securityHeaders);
// Health check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy' });
});
// Serve static files
app.use('/uploads/profile-pictures', express_1.default.static(path_1.default.join(__dirname, '../uploads/profile-pictures')));
app.use('/uploads/media', express_1.default.static(path_1.default.join(__dirname, '../uploads/media')));
app.use('/uploads/group-images', express_1.default.static(path_1.default.join(__dirname, '../uploads/group-images')));
app.use('/uploads/posts', express_1.default.static(path_1.default.join(__dirname, '../uploads/posts')));
app.use('/uploads/products', express_1.default.static(path_1.default.join(__dirname, '../uploads/products')));
app.use('/uploads/verification-documents', express_1.default.static(path_1.default.join(__dirname, '../uploads/verification-documents')));
// Caching for static
const cacheMiddleware = (duration) => (req, res, next) => {
    res.setHeader('Cache-Control', `public, max-age=${duration}`);
    next();
};
app.use('/static', cacheMiddleware(86400), express_1.default.static('public'));
// API routes
app.use('/api', routes_1.default);
// Error handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message
    });
});
// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not Found' });
});
// Run server
const PORT = 3000;
app.listen(PORT, '127.0.0.1', () => {
    console.log(`Server running on http://127.0.0.1:${PORT}`);
});
