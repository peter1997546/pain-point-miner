# Skill must interview Intent before invoking Script

Empty Intent remains a valid Script/CLI input (ADR-0004), but that does not authorize the Skill to skip guiding the Builder. On the Skill path the agent must explain Intent and each functional field (short illustrative examples OK; say the Builder may leave fields blank if nothing comes to mind — do not recommend empty), then wait for an explicit fill or skip before calling the Script. The Script/CLI may omit Intent (`{}`); it does not interview.
