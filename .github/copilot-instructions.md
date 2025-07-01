
# Calliope Proxy Service Development Guidelines

This document outlines the core architectural principles and coding standards for the Calliope Proxy Service. Adhering to these guidelines is crucial for maintaining a clean, scalable, and maintainable codebase.

## **1. Project Overview**

The Calliope Proxy Service is a Node.js application built with TypeScript and Express.js. Its primary purpose is to act as a central proxy for various external services, including:

*   **LLM Providers:** OpenAI, Anthropic, Cohere, Google, etc.
*   **Web Search:** Tavily, etc.
*   **Web Crawling:** Using Crawlee.
*   **Analytics:** Capturing and forwarding analytics events.
*   **IDE Integration:** Providing services for the Continue.dev IDE.

## **2. Architecture**

The project follows a classic layered architecture pattern:

*   **`src/index.ts`**: The application's entry point. It initializes the Express server, sets up middleware, and mounts the routers.
*   **`src/routes`**: Defines the API endpoints and maps them to the corresponding controllers. Each route file should be self-contained and focus on a specific domain (e.g., `modelProxyRoutes.ts`, `analyticsRoutes.ts`).
*   **`src/controllers`**: Controllers are responsible for handling incoming requests, validating input, and calling the appropriate services. **Controllers should be kept thin and should not contain any business logic.**
*   **`src/services`**: Services encapsulate the business logic of the application. They are responsible for interacting with external APIs, databases, and other services.
*   **`src/utils`**: Contains utility functions that can be reused across the application.
*   **`src/middleware`**: Contains Express.js middleware for tasks like logging, authentication, and error handling.
*   **`src/interfaces`**: Defines the data structures and types used throughout the application.

## **3. Coding Style and Conventions**

*   **TypeScript:** The project uses TypeScript. Use strong typing wherever possible and avoid using `any` unless absolutely necessary.
*   **SOLID Principles:** Follow the SOLID principles of object-oriented design.
*   **Dependency Injection:** Use dependency injection to decouple components and improve testability. The `ConfigService` is a good example of this.
*   **Error Handling:** Use the `globalErrorHandler` middleware to handle errors consistently. Throw custom errors using the `createValidationError` and other utility functions in `errorUtils.ts`.
*   **Logging:** Use the `console` for logging.
*   **Testing:** Use Jest for unit and integration tests. All new features should be accompanied by tests.
    *   **Mocks:** Use `jest.mock` to mock dependencies. For services, mock the entire service and provide a mock implementation for the methods you need to test.
    *   **Spies:** Use `jest.spyOn` to spy on methods of an object. This is useful for asserting that a method was called with the correct arguments.
    *   **Environment Variables:** Use `process.env` to set environment variables for testing. Remember to restore the original environment variables after each test.
    *   **Test Naming:** Test files should be named `{serviceName}.test.ts` or `{controllerName}.test.ts`. Test descriptions should be clear and concise.
    *   **Test Coverage:** Aim for high test coverage. All new code should be covered by tests.

## **4. Key Libraries and Frameworks**

*   **Express.js:** The web framework used to build the API.
*   **LangChain:** Used for interacting with LLMs.
*   **Crawlee:** Used for web crawling.
*   **Jest:** The testing framework.
*   **TypeScript:** The programming language.
*   **Dotenv:** Used for managing environment variables.
*   **Axios:** Used for making HTTP requests.
*   **Winston:** Used for logging.
