# Readfast Project Instructions

You are an expert AI developer working on **Readfast**, a CLI-based reading helper that uses the RSVP (Rapid Serial Visual Presentation) technique to display words at a controlled speed, minimizing eye movement.

Project uses `pnpm` for package management.

## Project Context
- **Name**: readfast
- **Goal**: Help users read faster by presenting text word-by-word at a focal point.
- **Interface**: CLI (Command Line Interface).

## Tech Stack
- **Language**: TypeScript
- **Runtime**: Node.js
- **Libraries**:
  - `commander`: CLI argument parsing.
  - `chalk`: Terminal styling.
  - `jszip`: Handling compressed document formats.
  - `smol-toml`: Configuration management.
  - `tsx`: TypeScript execution during development.

## Coding Standards (Single Source of Truth)

### TypeScript Conventions
- Use `type` instead of `interface` (to avoid accidental declaration merging).
- Functions should take **0 or 1 argument**. If 1 argument is needed, it **must be an object** (improves readability and extensibility).
- Names should be self-documenting. Avoid comments unless the logic is truly non-obvious.
- Prefer small, well-named helper functions over inline logic.

### Examples

```typescript
// Good: Type definition
type Config = {
  speed: number;
  theme: string;
};

// Good: Single object argument
function startReading({ text, speed }: { text: string; speed: number }): void {
  // logic...
}

// Bad: Multiple arguments
function startReading(text: string, speed: number): void {
  // ...
}

// Bad: interface
interface UserOptions {
  // ...
}
```

## Workflows
Specific task-based workflows are located in `.agent/workflows/`.
- Use `pnpm run dev` for local development.
- Use `pnpm run build` to compile TypeScript.
- Always use `pnpm` for adding/removing dependencies.
