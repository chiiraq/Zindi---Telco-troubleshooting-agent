import os
import json
import csv
import time
from typing import List, Dict, Any
import google.generativeai as genai
from dataclasses import dataclass

# Setup Logging
import logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# --- Configuration ---
# Set your GEMINI_API_KEY as an environment variable or replace here (not recommended)
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY environment variable is required")

genai.configure(apiKey=GEMINI_API_KEY)
model = genai.GenerativeModel('gemini-1.5-pro') # Using 1.5 Pro for best reasoning

# --- Categories for Track A ---
TRACK_A_CATEGORIES = {
    "C1": "Physical/Fiber Issues (e.g., Link Down, Low Rx Power)",
    "C2": "Interface/Layer 2 Config (e.g., MTU Mismatch, Shutdown, VLAN)",
    "C3": "Network/Layer 3 Protocol (e.g., OSPF Neighbor Down, BGP Flap)",
    "C4": "Resource/Congestion (e.g., High CPU, Packet Drops, Link Utilization)",
    "C5": "ACL/Security (e.g., Traffic blocked by policy)",
    "C6": "Infrastructure/Power (e.g., Node Unreachable, Power failure)",
    "C7": "Other/Complexity (Multiple issues or non-standard fault)"
}

class TelcoAgent:
    def __init__(self, server_url="http://localhost:8000"):
        self.server_url = server_url
        self.trace = []

    def log_step(self, step: str):
        self.trace.append(step)
        logger.info(step)

    def solve_track_a(self, scenario: Dict[str, Any]) -> str:
        """
        Diagnoses the fault category (C1-C7)
        """
        prompt = f"""
        You are an expert Telco Network Troubleshooting Agent. 
        Analyze the following network scenario and identify the root cause category.
        
        Scenario Description: {scenario.get('description')}
        Topology Snippet: {scenario.get('topology', 'N/A')}
        Observed Alarms: {scenario.get('alarms', 'N/A')}
        
        Fault Categories:
        C1: Physical Layer (Hardware/Cable)
        C2: Interface/Config (L2 settings, MTU, Shutdown)
        C3: Protocol Fault (OSPF/BGP/IS-IS issues)
        C4: Congestion/Performance (High utilization/drops)
        C5: ACL/Filtering (Security policy blocking)
        C6: Node/Power (Total node failure)
        C7: Unknown/Other
        
        Respond ONLY with the category code (e.g., C1, C2, etc.) followed by a brief 1-sentence reasoning.
        Format: [CODE] [REASONING]
        """
        try:
            response = model.generate_content(prompt)
            result = response.text.strip()
            # Extract code (e.g., C3)
            for category in TRACK_A_CATEGORIES.keys():
                if category in result:
                    self.log_step(f"Track A Result: {category} - {result}")
                    return category
            return "C7" # Default
        except Exception as e:
            logger.error(f"Error in solve_track_a: {e}")
            return "C7"

    def solve_track_b(self, scenario: Dict[str, Any]) -> str:
        """
        Provides the optimization path/fix (e.g. NodeA->NodeB)
        """
        prompt = f"""
        You are a Network Optimization Agent. 
        Given a request to optimize or fix a service path, identify the best link or path.
        
        Problem: {scenario.get('problem')}
        Available Nodes: {scenario.get('nodes')}
        Current Path Status: {scenario.get('status')}
        
        Provide the answer in the specific format expected by the challenge: 
        SourceNode->TargetNode(Interface/...) or similar.
        If unsure, provide the most logical next-hop optimization.
        
        Respond with ONLY the path string.
        """
        try:
            response = model.generate_content(prompt)
            result = response.text.strip().split('\n')[0]
            self.log_step(f"Track B Result: {result}")
            return result
        except Exception as e:
            logger.error(f"Error in solve_track_b: {e}")
            return "N/A"

def main():
    import sys
    input_files = sys.argv[1:] if len(sys.argv) > 1 else ["test.json"]
    
    scenarios_map = {}
    for test_file in input_files:
        if not os.path.exists(test_file):
            logger.error(f"File {test_file} not found. Skipping.")
            continue

        with open(test_file, 'r') as f:
            data = json.load(f)
            if not isinstance(data, list):
                data = [data]
            
            for s in data:
                sid = s.get("ID") or s.get("scenario_id")
                if sid in scenarios_map:
                    scenarios_map[sid].update(s)
                else:
                    scenarios_map[sid] = s

    if not scenarios_map:
        logger.error("No scenarios loaded. Usage: python main.py track_a.json track_b.json")
        return

    agent = TelcoAgent()
    results = []

    for sid, scenario in scenarios_map.items():
        logger.info(f"Processing Scenario: {sid}")
        
        track_a_ans = agent.solve_track_a(scenario)
        track_b_ans = agent.solve_track_b(scenario)
        
        results.append({
            "ID": sid,
            "Track A": track_a_ans,
            "Track B": track_b_ans
        })

    # Save to CSV
    output_file = "result.csv"
    with open(output_file, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=["ID", "Track A", "Track B"])
        writer.writeheader()
        writer.writerows(results)

    # Save traces as required by competition
    with open("traces.json", "w") as f:
        json.dump(agent.trace, f, indent=2)

    logger.info(f"Done! Results saved to {output_file} and traces.json")

if __name__ == "__main__":
    main()
