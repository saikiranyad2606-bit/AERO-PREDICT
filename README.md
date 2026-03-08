# AeroPredict – AI Arrival Management System (AMAN)

AI-powered aviation analytics system that simulates an Arrival Management System (AMAN) used in modern air traffic management to optimize airport arrival flow and runway utilization.

---

## Project Overview

Airports frequently experience congestion when multiple aircraft arrive within a short time window. When the demand for landing exceeds runway capacity, aircraft are forced into holding patterns, increasing delays, fuel consumption, and operational costs.

AeroPredict simulates how an Arrival Management System (AMAN) manages these situations by analyzing incoming aircraft traffic and assigning optimized landing sequences based on estimated time of arrival (ETA) and runway capacity constraints.

The project demonstrates how **data-driven decision systems and AI-based analytics** can improve airport operations and air traffic flow management.

---

## Key Features

* Aircraft arrival sequencing based on ETA
* Runway capacity modeling
* Detection of holding patterns and arrival delays
* Delay and holding time analytics
* Estimated fuel burn impact from holding patterns
* Aviation operations data simulation and analysis

---

## System Architecture

Flight Data Source (Simulation / ADS-B)

↓

Arrival Processing Engine

↓

Runway Capacity Model

↓

Arrival Sequencing Algorithm

↓

Operational Analytics Engine

↓

API Output / Dashboard

---

## Technologies Used

* **Python**
* **FastAPI**
* **Aviation analytics models**
* **Flight data simulation**

---

## Installation

Clone the repository:

git clone https://github.com/yourusername/AERO-PREDICT.git

Navigate to the project directory:

cd AERO-PREDICT

Install dependencies:

pip install -r requirements.txt

Run the server:

uvicorn main:app --reload

---

## API Endpoints

**GET /health**
Returns system health status.

**GET /aircraft**
Returns current aircraft in the simulation.

**GET /analytics**
Provides operational metrics such as delays, holding aircraft, and runway utilization.

**POST /plan-routes**
Processes aircraft arrivals and generates optimized landing sequencing.

---

## Example Output

{
"airport": "VOHS",
"total_aircraft": 12,
"runway_capacity": 8,
"holding_aircraft": 3,
"average_delay_minutes": 4.2
}

---

## Project Purpose

This project explores how **Artificial Intelligence and aviation analytics** can support airport and airline operations by improving arrival flow management, reducing congestion, and enhancing runway utilization.

It demonstrates concepts similar to those used in real-world arrival management systems deployed by airlines and air navigation service providers.

---

## Future Improvements

* Integration with **live ADS-B flight data**
* Machine learning models for **arrival time prediction**
* Fuel-efficient speed optimization
* Advanced runway scheduling algorithms
* Real-time airport traffic dashboard

---

## Author

Developed as part of research and experimentation in **AI-driven aviation operations and analytics systems**.
