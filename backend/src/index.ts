import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { rateLimit } from 'express-rate-limit';
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
  origin: 'http://127.0.0.1:5173', // Updated to HTTP and 127.0.0.1
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
  max: 5,
  message: 'Too many login attempts. Please wait before trying again.',
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 500,
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'GET'
});

const profileLimiter = rateLimit({
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
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1000,
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'GET'
});

app.use(generalLimiter);

// Security headers
app.use(newSecurityHeaders);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

// Serve static files
app.use('/uploads/profile-pictures', express.static(path.join(__dirname, '../uploads/profile-pictures')));
app.use('/uploads/media', express.static(path.join(__dirname, '../uploads/media')));
app.use('/uploads/group-images', express.static(path.join(__dirname, '../uploads/group-images')));
app.use('/uploads/posts', express.static(path.join(__dirname, '../uploads/posts')));
app.use('/uploads/products', express.static(path.join(__dirname, '../uploads/products')));
app.use('/uploads/verification-documents', express.static(path.join(__dirname, '../uploads/verification-documents')));

// Caching for static
const cacheMiddleware = (duration: number) => (req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', `public, max-age=${duration}`);
  next();
};
app.use('/static', cacheMiddleware(86400), express.static('public'));

// API routes
app.use('/api', router);

// Error handling
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

// Run server
const PORT =  3000;

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Server running on http://127.0.0.1:${PORT}`);
});

