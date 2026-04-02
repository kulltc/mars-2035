FROM python:3.13-slim

WORKDIR /app

# Install uv for fast dependency management
RUN pip install --no-cache-dir uv

# Copy project files
COPY agent/pyproject.toml agent/pyproject.toml
COPY agent/src agent/src
COPY agent/static agent/static

# Install the package
RUN cd agent && uv pip install --system -e .

# Data directory will be mounted as a volume
RUN mkdir -p /app/agent/data

WORKDIR /app/agent

EXPOSE 8080

CMD ["python", "-m", "agent", "serve", "--host", "0.0.0.0", "--port", "8080"]
