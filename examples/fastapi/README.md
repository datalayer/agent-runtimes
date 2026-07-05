[![Datalayer](https://assets.datalayer.tech/datalayer-25.svg)](https://datalayer.io)

[![Become a Sponsor](https://img.shields.io/static/v1?label=Become%20a%20Sponsor&message=%E2%9D%A4&logo=GitHub&style=flat&color=1ABC9C)](https://github.com/sponsors/datalayer)

# FastAPI + Datalayer Client Example

This example demonstrates how to integrate the Datalayer Client with FastAPI to serve machine learning models using Runtime snapshots.

## Overview

This example showcases:

- **FastAPI Integration**: A modern, fast web framework for building APIs with Python
- **Datalayer Client**: Integration with Datalayer's client.
- **Snapshot Loading**: Loading and serving pre-trained models from Runtime snapshots.
- **Scikit-learn Models**: Example implementation using sklearn models
- **RESTful API**: Clean API endpoints for model predictions.

## Features

- ✅ Train ML model on a Datalayer Runtime.
- ✅ Save a Runtime Snapshot for future model prediction.
- ✅ Load ML models from Datalayer snapshots.
- ✅ FastAPI-based REST API with automatic documentation.
- ✅ Type hints and Pydantic models for request/response validation.

## Prerequisites

- Python 3.9+
- Datalayer Client
- FastAPI
- Scikit-learn
- Uvicorn (ASGI server)

## Installation

1. **Clone the repository**:

   ```bash
   git clone https://github.com/datalayer/core.git
   cd core/examples/fastapi
   ```

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

## Quick Start

1. **Run the model training and create a snapshot**:

   ```bash
   python app/scripts/snapshot.py
   ```

2. **Start the FastAPI server**:

   ```bash
   cd app
   uvicorn app/main:app --reload --host 0.0.0.0 --port 8000
   ```

3. **Access the API**:
   - **API Documentation**: http://localhost:8000/docs
   - **Alternative Docs**: http://localhost:8000/redoc
   - **Info Check**: http://localhost:8000/

## API Endpoints

### Information

```http
GET /
```

Returns the API welcome message.

### Model Prediction

```http
POST /predict
```

Make predictions using the loaded model.

**Request Body**:

```json
{
  "features": [1.0, 2.0, 3.0, 4.0]
}
```

**Response**:

```json
{
  "prediction": "0"
}
```

## Project Structure

```
fastapi/
├── requirements.txt      # Python dependencies
├── README.md             # This file
└── app/
    ├── main.py           # FastAPI application and endpoints
    ├── models.py         # Pydantic model definition
    └── scripts/
        ├── predict.py    # Model prediction logic
        ├── train.py      # Model training logic
        └── snapshot.py   # Model traning and snapshot creation
```

## Usage Examples

### Using curl

```bash
# Info check
curl -X GET "http://localhost:8000/"

# Make a prediction
curl -X POST "http://localhost:8000/predict" \
  -H "Content-Type: application/json" \
  -d '{
    "features": [5.1, 3.5, 1.4, 0.2]
  }'
```

### Using Python requests

```python
import requests

# Info check
response = requests.get("http://localhost:8000/")
print(response.json())

# Make prediction
data = {
    "features": [5.1, 3.5, 1.4, 0.2]
}
response = requests.post("http://localhost:8000/predict", json=data)
print(response.json())
```

## License

This project is licensed under the MIT License - see the [LICENSE](../../LICENSE) file for details.

## Support

- **Documentation**: [Datalayer Platform Documentation](https://datalayer.ai/docs/)
- **Issues**: [GitHub Issues](https://github.com/datalayer/core/issues)
- **Community**: [Datalayer Platform](https://datalayer.app/)

---

<p align="center">
  <strong>🚀 AI Agents for Data Analysis</strong><br></br>
  <a href="https://datalayer.app/">Get started with Datalayer today!</a>
</p>
