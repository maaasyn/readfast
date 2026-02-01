# Readfast

**Readfast** is a terminal-based speed reading tool that uses **Rapid Serial Visual Presentation (RSVP)** to help you read faster and more efficiently. By displaying words one by one at their optimal recognition point, Readfast minimizes eye movement and reduces fatigue, allowing you to consume content from files or URLs directly in your terminal.

## Key Features

- 🚀 **Speed Reading**: Adjustable WPM (Words Per Minute) with RSVP.
- 📄 **Multi-Format Support**: Reads Plain Text, Markdown, EPUB, and Webpages (URLs).
- 🧩 **Smart Rendering**: Aligns words on their Optimal Recognition Point (ORP) for faster processing.
- 🎮 **Interactive Controls**: Pause, navigate, adjust speed on the fly, and browse chapters.
- 🧘 **Zen Mode**: Distraction-free reading experience with minimal UI.
- 💾 **Progress Saving**: Automatically remembers where you left off for each file.
- ⏱️ **Tap Tempo**: Set your reading speed by tapping a key to your desired rhythm.

## Installation

```bash
# Install globally via npm
npm install -g readfast

# Or via pnpm
pnpm add -g readfast
```

## Usage

Start reading a file or URL:

```bash
readfast path/to/book.epub
readfast https://example.com/article
```

### Examples

Try reading a classic Polish epic ("Pan Tadeusz" from Project Gutenberg):

```bash
readfast https://gist.githubusercontent.com/tomekziel/47b7c3dffb17adbc70c42b9be8dc93a7/raw/b8b229566ad2be8fde7456697b90b50d98fa2129/pantadeusz.txt
```

Pipe text directly:

```bash
echo "Hello world" | readfast
cat document.txt | readfast
```

### Options

| Option | Description |
|--------|-------------|
| `-s, --speed <wpm>` | Set initial reading speed (default: 300) |
| `-z, --zen` | Start in zen mode (no status bar) |
| `--fresh` | Ignore saved progress and start from beginning |
| `--start <word>` | Start from specific word number |
| `-c, --context <n>` | Show N words before and after for context |

### Controls

| Key | Action |
|-----|--------|
| `Space` | Pause/Resume |
| `←` / `→` | Navigate words (hold to seek) |
| `↑` / `↓` | Adjust speed (+/- 25 WPM) |
| `G` | Go to (word number, %, or chapter) |
| `B` | Browse chapters (if available) |
| `T` | Tap tempo (tap at least twice to set WPM) |
| `Z` | Toggle Zen mode |
| `Q` / `Esc` | Quit |

## Progress Tracking

Readfast automatically bookmarks your progress for every file you read. This data is stored in the **XDG Data Home** directory.

- **Storage Location**: `~/.local/share/readfast/progress.json` (or `$XDG_DATA_HOME/readfast/progress.json`)
- **Data Format**: JSON file where keys are absolute file paths and values contain:
  - `index`: Last read word index
  - `wpm`: Last used reading speed
  - `lastRead`: Timestamp

### Managing Progress

Currently, progress is best managed by simply editing or deleting the JSON file if you need to reset specific entries.

To reset progress for a specific file from the CLI, use:
```bash
readfast --fresh path/to/book.epub
```

## Configuration

Readfast honors the **XDG Base Directory Specification**. It stores your reading progress and preferences automatically.

- **Configuration**: `~/.config/readfast/config.toml` (overridden by `$XDG_CONFIG_HOME/readfast/config.toml`)
- **Data (Progress)**: `~/.local/share/readfast/progress.json` (overridden by `$XDG_DATA_HOME/readfast/progress.json`)

You can view your active config and data paths by running:

```bash
readfast --show-config
```

Check out the [examples/config.toml](file:///Users/marcin/Documents/projects/readfast/examples/config.toml) for a template with all available options.

## License

UNLICENSED
