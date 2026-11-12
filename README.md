# Telco Troubleshooting Agent

An AI agent that diagnoses faults in telecom networks and recommends optimization paths, built with Google's Gemini model for a Zindi competition on telecom network troubleshooting.

Given a scenario with a description, topology snippet and alarms, the agent decides what kind of fault it is and what the best fix or path is. Results are written in the format the competition expects.

## The two tasks

The competition has two tracks, and the agent answers both for every scenario.

**Track A: fault classification.** The agent reads the scenario description, topology snippet and observed alarms, then assigns one of seven root-cause categories:

| Code | Category |
|------|----------|
| C1 | Physical or fiber issues, such as link down or low Rx power |
| C2 | Interface or Layer 2 configuration, such as MTU mismatch, shutdown or VLAN |
| C3 | Network or Layer 3 protocol faults, such as an OSPF neighbor down or a BGP flap |
| C4 | Resource or congestion problems, such as high CPU, packet drops or link utilization |
| C5 | ACL or security policy blocking traffic |
| C6 | Infrastructure or power failure, such as an unreachable node |
| C7 | Other, including multiple issues or non-standard faults |

The model is asked to reply with a category code and a one-sentence reason. The script pulls the code out of the reply. If no valid code can be found, or the API call fails, it falls back to C7.

**Track B: optimization path.** The agent reads the problem statement, the available nodes and the current path status, then returns the best link or path to use, in a format like `SourceNode->TargetNode(Interface/...)`. If the call fails it returns `N/A`.

## How it works

1. The script loads one or more JSON files of scenarios. With no arguments it reads `test.json`.
2. If the same scenario ID appears in several files (for example one file per track), the entries are merged by `ID` or `scenario_id`.
3. For each scenario it sends one prompt for Track A and one for Track B to `gemini-1.5-pro`.
4. It writes the answers to `result.csv` with the columns `ID`, `Track A` and `Track B`.
5. It saves the log of each step to `traces.json`, which the competition requires.

## Setup

You'll need Python 3 and a Gemini API key from https://aistudio.google.com.

```
git clone https://github.com/chiiraq/Zindi---Telco-troubleshooting-agent.git
cd Zindi---Telco-troubleshooting-agent
python3 -m venv venv
source venv/bin/activate
pip install google-generativeai
```

The script reads the key from an environment variable, so export it in your shell before running:

```
export GEMINI_API_KEY=your_key_here
```

`.env.example` shows the variable name. Never commit a real key.

## Running it

With the default `test.json`:

```
python main.py
```

With your own files, for example one per track:

```
python main.py track_a.json track_b.json
```

When it finishes, you'll find `result.csv` and `traces.json` in the project folder.

## Web interface

The repository also contains a Vite and TypeScript front end, created from Google's AI Studio template. To run it you need Node.js:

```
npm install
```

Put your key in `.env.local` as `GEMINI_API_KEY`, then start it:

```
npm run dev
```

## Project files

| File | Purpose |
|------|---------|
| `main.py` | The agent: prompts, answer parsing and output files |
| `test.json` | Input scenarios |
| `result.csv` | Output of the last run |
| `src/`, `index.html`, `vite.config.ts` | Front end |
| `.env.example` | Names the environment variable needed |

## Limitations

- Track A uses a simple text match to find the category code in the model's reply, so an unexpected reply format falls back to C7.
- Track B depends on the model following the path format from the prompt, and there is no validation of the answer against the real topology.
- Scenarios are processed one at a time with no retry logic, so a failed API call produces a default answer instead of trying again.
- The model name is set in the code and needs updating if Google retires it.
