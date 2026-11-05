# Member settings implementation notes

Historical proposal superseded during PR #13 integration. The shipped implementation
uses the official DSH rc.5 configForms mutation contract (atomic ops plus a fixed
expectedRevision), and agentPresets.composedPreset(agent.ctx) to restrict prompt
sections to live Cabinet agents. Membership alone is not a mode boundary.

Settings are shared per DSH_HOME/profile. Browser drafts are explicit-save and are
discarded on unmount; no delayed autosave remains. See the README and
scripts/test-member-settings.mjs for semantics and contract regressions.

The rc.5 package implementation was inspected locally. Mock contract tests are not
browser end-to-end evidence; real browser verification is recorded separately.
