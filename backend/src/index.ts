import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { rateLimit } from 'express-rate-limit';
import https from 'https';
import fs from 'fs';
import path from 'path';
import compression from 'compression';
import helmet from 'helmet';
import { Request, Response, NextFunction } from 'express';

// Import routes
import router from './routes';

// Import middleware
import { securityHeaders } from './middleware/securityMiddleware';
import { sqlInjectionFilter, securityHeaders as newSecurityHeaders } from './middleware/security';

// Load environment variables
dotenv.config();

const app = express();

// Configure CORS
app.use(cors({
  origin: 'https://localhost:5173', // Updated to HTTPS
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// SQL Injection protection middleware - apply to all API routes
app.use('/api', sqlInjectionFilter);

// Add middleware to properly parse form values
app.use((req, res, next) => {
  // Handle form data boolean values correctly
  if (req.body && typeof req.body === 'object') {
    for (const key in req.body) {
      if (req.body[key] === 'true') {
        req.body[key] = true;
      } else if (req.body[key] === 'false') {
        req.body[key] = false;
      }
    }
  }
  next();
});

// Remove sensitive headers
app.disable('x-powered-by');

// Rate limiting configuration
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: 'Too many login attempts. Please wait before trying again.',
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 500, // 500 requests per minute (increased from 100)
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for GET requests to reduce unnecessary restrictions
    return req.method === 'GET';
  }
});

const profileLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300, // 300 requests per minute for profile related endpoints (increased from 60)
  message: 'Too many profile requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for GET requests to profile endpoints
    return req.method === 'GET';
  }
});

// Apply rate limiters to specific routes
app.use('/api/auth/login', loginLimiter);
app.use('/api/users/upload', profileLimiter); // Only limit profile updates/uploads
app.use('/api/users/search', apiLimiter);

// Apply a more lenient general limiter to all other routes
const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 1000, // 1000 requests per minute (increased from 300)
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for GET requests
    return req.method === 'GET';
  }
});

app.use(generalLimiter);

// Security headers - use the new implementation with enhanced headers
app.use(newSecurityHeaders);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

// Serve static files from uploads directory
app.use('/uploads/profile-pictures', express.static(path.join(__dirname, '../uploads/profile-pictures')));
app.use('/uploads/media', express.static(path.join(__dirname, '../uploads/media')));
app.use('/uploads/group-images', express.static(path.join(__dirname, '../uploads/group-images')));
app.use('/uploads/posts', express.static(path.join(__dirname, '../uploads/posts')));
app.use('/uploads/products', express.static(path.join(__dirname, '../uploads/products')));
app.use('/uploads/verification-documents', express.static(path.join(__dirname, '../uploads/verification-documents')));

// Add caching headers middleware
const cacheMiddleware = (duration: number) => (req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', `public, max-age=${duration}`);
  next();
};

// Use it on static routes
app.use('/static', cacheMiddleware(86400), express.static('public'));

// Routes
app.use('/api', router);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
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

const PORT = process.env.PORT || 3000;

// SSL configuration
const sslOptions = {
  key: fs.readFileSync(path.join(__dirname, '../certificates/private.key')),
  cert: fs.readFileSync(path.join(__dirname, '../certificates/certificate.crt'))
};

// Create HTTPS server
const server = https.createServer(sslOptions, app);

server.listen(PORT, () => {
  console.log(`Server running on https://localhost:${PORT}`);
}); 