# Script + Skill hybrid because crawl volume blows up agent context

A pure Skill that pulls Reddit / HN / stores / follow-ons into the agent context will overwhelm the model with raw Evidence. v1 keeps a Script for crawl → cluster → Count Gate / Saturation Stop, and a Skill that orchestrates the Script then runs Analysis Pass only on the condensed candidates.