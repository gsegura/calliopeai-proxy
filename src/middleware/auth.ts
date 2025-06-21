import { Request, Response, NextFunction } from 'express';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    slug: string;
    email: string;
  };
}

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

  //TODO: Implement JWT validation and user extraction
  // In a real implementation, you would decode the JWT and extract user info
      // For demo purposes, we'll extract a mock user from the token or set a default
      
     // try {
        // TODO: Replace with actual JWT decoding
        // const decoded = jwt.verify(token, process.env.JWT_SECRET);
        // req.user = decoded.user;
        
        // For demo purposes, set a default user
        // In practice, this would come from JWT claims
     //   req.user = {
     //     id: 'user-001', // This should come from JWT claims
     //     slug: 'demo-user',
      //    email: 'demo@example.com'
      //  };
        
     //   next();
    //  } catch (error) {
    //    res.status(401).json({ error: 'Unauthorized: Invalid JWT token.' });
     // }
};

export const authenticateBearerToken = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
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
