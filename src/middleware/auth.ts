import { Request, Response, NextFunction } from 'express';

export const authenticateToken = (req: Request, res: Response, next: NextFunction): void => {
  const requiredHeaders = ['key', 'timestamp', 'v', 'extensionversion', 'os', 'uniqueid'];
  const missingHeaders = [];

  for (const header of requiredHeaders) {
    if (!req.headers[header]) {
      missingHeaders.push(header);
    }
  }

  if (missingHeaders.length > 0) {
    res.status(401).json({
      error: `Unauthorized: Missing required headers: ${missingHeaders.join(', ')}`
    });
    return;
  }

  // For now, validation is just a presence check.
  // More sophisticated validation can be added later.

  next();
};

export const authenticateBearerToken = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7); // Extract token part
    if (token) {
      // For now, just checking for presence of a token after "Bearer "
      // Actual token validation (e.g., JWT verification, lookup) would go here.
      // req.user = decodedToken; // Example of attaching user info
      next();
    } else {
      res.status(401).json({ error: 'Unauthorized: Bearer token is empty.' });
    }
  } else {
    res.status(401).json({ error: 'Unauthorized: Missing or invalid Bearer token in Authorization header.' });
  }
};
