# Use an official Python runtime as a parent image
FROM python:3.11-slim

# Set the working directory in the container
WORKDIR /app

# Install uv, the package installer
RUN pip install uv

# Install markitdown-mcp and its dependencies
# Ensure that this also installs any necessary system dependencies if known
# For now, assuming uv handles all Python-level dependencies
RUN uv pip install markitdown-mcp

# Expose port 8080 for the MCP server
EXPOSE 8080

# Define the entrypoint to run the markitdown-mcp server
# The exact command might need adjustment based on how markitdown-mcp is run
# Assuming 'markitdown-mcp' is the command to start the server
# and it listens on 0.0.0.0 by default or can be configured to do so.
ENTRYPOINT ["markitdown-mcp"]

# Optionally, specify a CMD if the entrypoint needs arguments or if you want to provide default arguments
# For example, if markitdown-mcp needs a host and port:
# CMD ["--host", "0.0.0.0", "--port", "8080"]
# For now, assuming the entrypoint alone is sufficient or has sensible defaults.
