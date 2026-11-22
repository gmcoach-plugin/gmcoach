<p align="center">
  <img src="docs/logo.png" alt="GM Coach logo" width="160">
</p>

<h1 align="center">GM Coach</h1>

<p align="center">
  A local coaching plugin for Codex, ChatGPT and Claude that plans Gym Monster strength training from your own workout history and current research.
</p>

<p align="center">
  <b>English</b> · <a href="README.pl.md">Polski</a>
</p>

<p align="center">
  <a href="https://github.com/gmcoach-plugin/gmcoach/releases/latest"><img src="https://img.shields.io/github/v/release/gmcoach-plugin/gmcoach?label=release" alt="Latest release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/gmcoach-plugin/gmcoach" alt="MIT license"></a>
  <a href="https://ko-fi.com/gmcoach"><img src="https://img.shields.io/badge/Ko--fi-support-FF5E5B?logo=kofi&logoColor=white" alt="Support on Ko-fi"></a>
</p>

<p align="center">
  <img src="docs/gm-coach-claude-workout.png" alt="GM Coach in Claude showing tomorrow's Gym Monster workout" width="640">
</p>

## Features

### Planning

- **Training plans:** creates Gym Monster programs for strength, timed exercises and cardio, using only exercises and accessories you confirm, with a matching warm-up and stretching.
- **Multi-week cycles:** plans progression and deloads week by week, with dates, and saves the whole cycle after one approval. An interrupted save can be safely resumed.
- **Smart RM and resistance modes:** uses the Gain Muscle, Stamina and Strength presets and the Standard, Chain and Eccentric modes, or a fixed load suggested from your 1RM.
- **Editing saved workouts:** changes rest, resistance mode, load or exercise order and shows the differences before saving.
- **Calendar:** reads your Speediance calendar and schedules saved workouts on chosen days.
- **Session length:** estimates how long a workout takes and fits the plan to the time you have.

### Analysis and recovery

- **Workout history:** reads completed sessions with sets, loads, heart rate, rowing data and period statistics.
- **Session comparison:** compares two completed sessions set by set.
- **Recovery data:** reads Speediance health reports such as sleep, HRV, fatigue and muscle load, with your permission.

### Personal coaching

- **Training profile:** a short interview records your goals, preferences and limitations locally.
- **Injury-aware plans:** takes reported movement limitations into account.
- **Equipment:** checks your accessories and what each exercise needs, and searches the Gym Monster exercise catalogue.
- **Research-backed decisions:** searches PubMed and links real sources to plan decisions.

### More

- **Official content:** browses official Speediance workouts and programs.
- **Plan sharing and import:** exports a plan or a saved workout to a file, and imports shared plans and workout JSON files. Every imported exercise and dose is checked before anything is saved.
- **Quick test workout:** creates a one-off test session to try an exercise or setting.
- **Multiple accounts:** supports several Speediance profiles on one computer.
- **Template limit:** detects a full template list and suggests unused templates to remove, only with your approval.
- **Diagnostics:** checks the plugin version and the connection to your Speediance account.

### Safety and privacy

- **Safe writes:** shows a full preview of every plan and saves it to your account only after your explicit confirmation.
- **Interrupted saves:** if a save is interrupted, GM Coach checks your account before trying again, so a workout is never saved twice. A multi-week cycle continues from where it stopped.
- **Local memory:** remembers facts you ask it to keep, such as equipment or preferences, and forgets them when you ask.
- **Local and private:** runs on your computer, and your Speediance password stays in the system password store.

### How a new plan is built

GM Coach works through clear steps and shows its progress while it prepares a plan:

<p align="center">
  <img src="docs/gm-coach-plan-steps.png" alt="GM Coach plan-building steps: profile and intake audit, history and calendar, exercises and doses, science review and preview, plan for approval" width="330">
</p>

## Supported apps

| App | Platform | Installation guide |
|---|---|---|
| Codex (optionally ChatGPT through a secure tunnel) | Windows; macOS and Linux experimental | [English](installer/codex/README-INSTALL-EN.md) · [Polski](installer/codex/README-INSTALACJA.md) |
| Claude (desktop app and Claude Code) | Windows; macOS and Linux experimental | [English](installer/claude/README-CLAUDE-EN.md) · [Polski](installer/claude/README-CLAUDE.md) |

## Quick start

1. Download the installer for your app from the [latest release](https://github.com/gmcoach-plugin/gmcoach/releases/latest).
2. Verify the file against its `.sha256` checksum.
3. Extract the whole archive and run `START-WINDOWS.cmd` (Codex) or `START-CLAUDE-WINDOWS.cmd` (Claude).
4. Open a new chat and write: *"GM Coach, help me connect my Speediance account."*

You need a Speediance account and a Gym Monster. See the installation guide for macOS, Linux, updates and uninstalling.

**Tested devices:** Gym Monster **GM1** and **GM2**.

## Privacy and security

- Your Speediance password is stored only in your operating system's credential store (Windows Credential Manager, macOS Keychain or Linux Secret Service). Never share it in a chat.
- The plugin reads your history and changes your account only after you allow it in the conversation.
- The installers download dependencies from official sources and verify their checksums.

## Reporting bugs and requesting features

Use [GitHub Issues](https://github.com/gmcoach-plugin/gmcoach/issues/new/choose). Include the plugin version from the local diagnostics, and do not post passwords, e-mail addresses, tokens or keys.

## Support the project

GM Coach is free. If it helps your training, you can [support it on Ko-fi](https://ko-fi.com/gmcoach).

## License

Released under the [MIT License](LICENSE).

## Disclaimer

GM Coach is an independent project and is not affiliated with, endorsed by or sponsored by Speediance. Gym Monster and Speediance are trademarks of their respective owners. The training suggestions do not replace advice from a qualified coach or medical professional.
