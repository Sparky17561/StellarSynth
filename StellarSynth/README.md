# ☀️ StellarSynth: Advanced Solar Intelligence & Predictive Mission Control

**StellarSynth** is a high-fidelity solar flare prediction platform designed for mission operators and heliophysicists. By integrating real-time telemetry from **NOAA (GOES-16/19)** and deep-space magnetograms from **NASA/JSOC (SDO/HMI)**, StellarSynth provides actionable, AI-driven insights into solar activity and its impact on Earth's infrastructure.

---

## 🚀 Core Intelligence: AthenaCTGRU
At the heart of the platform is the **AthenaCTGRU** (Conditional Transition Gated Recurrent Unit) model.
- **Input Architecture:** Analyzes 12 specific magnetic telemetry features (including E-free, J-total, and Jolt) derived from HARP (HMI Active Region Patch) data.
- **Predictive Horizons:** Generates 12h, 24h, 36h, and 48h flare probability windows.
- **Weighted Global Risk:** Implements an area-proportional scoring algorithm that ensures massive, dangerous sunspots dominate the global threat assessment, preventing "threat dilution" from smaller, inactive regions.

---

## 🛠️ Key Features

### 🖥️ Mission Control Dashboard
A high-density, real-time command center featuring:
- **Weighted Global Risk Banner:** Instant visibility into the total solar threat level.
- **Active Region Intelligence:** Detailed cards for each tracked sunspot, showing Earth-facing directness, predicted Time-to-Event (TTE), and specific infrastructural impact tiers (Nominal, CME Monitor, Radio Risk).
- **Interactive Legends:** On-demand technical keys for decoding complex heliophysics indicators.

### 📊 30-Day Risk Heatmap (Performance Audit)
A historical "Report Card" that benchmarks AI accuracy against ground truth:
- **Satellite Verification:** Compares 12h AI verdicts against actual **GOES-16 X-ray flux** peaks.
- **Visual Accuracy:** Color-coded grid showing Hits (Green), Misses (Red), and Data Gaps (Gray).
- **Temporal Traversal:** Fully functional calendar navigation for auditing historical model reliability across months and years.

### ✨ Stella AI Analyst
A specialized conversational agent powered by **Llama-3.3-70B (via Groq)**:
- **Data Grounded:** Stella has direct access to live NOAA telemetry (Solar Wind, Kp Index, Bz Component) and current ML predictions.
- **Specialized Knowledge:** Trained strictly on solar physics and space weather protocols to provide technical briefings without "AI hallucinations."

---

## 💻 Tech Stack

- **Frontend:** React 19, Vite, Chart.js, Recharts, Lucide Icons.
- **Backend:** FastAPI (Python), SQLAlchemy, PostgreSQL, Groq SDK.
- **Data Science/ML:** PyTorch, SunPy, Astropy, Pandas, DRMS (JSOC Integration).
- **Styling:** Premium Vanilla CSS with a high-density "Mission Control" design system.

---

## 📥 Installation & Setup

### Prerequisites
- Python 3.10+
- Node.js 18+
- PostgreSQL Database
- [Groq API Key](https://console.groq.com/)

### Backend Setup
1. Navigate to `/backend`:
   ```bash
   pip install -r requirements.txt
   ```
2. Create a `.env` file with your database credentials and `GROQ_API_KEY`.
3. Run the server:
   ```bash
   uvicorn main:app --reload
   ```

### Frontend Setup
1. Navigate to `/frontend`:
   ```bash
   npm install
   ```
2. Start the dev server:
   ```bash
   npm run dev
   ```

