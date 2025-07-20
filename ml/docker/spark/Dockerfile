# Base image with Spark and Python pre-installed
FROM bitnami/spark:3.5

# Install Python dependencies
COPY requirements.txt /
RUN pip install --no-cache-dir -r /requirements.txt

# Set the working directory
WORKDIR /app