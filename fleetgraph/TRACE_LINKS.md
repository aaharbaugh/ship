# FleetGraph Trace Links

Use this file to capture the two required LangSmith execution paths for MVP submission.

## Trace 1: Save-triggered or collaboration-idle execution

- Path: document edit -> FleetGraph queue -> batch flush -> analysis -> persist
- Suggested document: active issue or wiki with linked work
- LangSmith link: https://smith.langchain.com/public/39b784d1-7d09-4af0-b692-f55aa3bfd8fe/r
- Notes:

## Trace 2: Nightly scan execution

- Path: `pnpm fleetgraph:nightly-scan` or `POST /api/fleetgraph/nightly-scan`
- Suggested workspace: one with at least one red or yellow project
- LangSmith link: https://smith.langchain.com/public/cad8a96c-2624-4553-a391-b79a47cc0fb7/r
- Notes:

## Capture Checklist

- Confirm `GET /api/fleetgraph/readiness` shows `langSmithEnabled: true`
- Confirm `OPENAI_API_KEY` is present if you want a GPT-4o trace path
- Use different execution paths for the two submitted links
- Paste share links here once captured
