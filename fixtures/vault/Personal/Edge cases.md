# Edge cases

Each line says whether Piw reads it as a task.

- [ ] Plain open task
- [X] Capital X counts as done
- [-] Cancelled marker: not a task in format 1
- [ ]
-[ ] Missing space after the bullet: not a task
- [ ]No space after the box: not a task
+ [ ] Plus bullet
	- [ ] Tab-indented child of the plus bullet
- [ ] Due with a variation selector 📅️ 2026-11-12
- [ ] Impossible date stays text 📅 2026-02-30
- [ ] Two due dates, the last one counts 📅 2026-11-01 📅 2026-11-20
- [ ] Other Tasks emoji stay in the text ⏫ 🔁 every week 📅 2026-11-13
- [x] Done without a completion date
- [ ] Continuation lines
  belong to the task but are not part of its title

> - [ ] Inside a quote: not a task in format 1

`- [ ] inline code: not a task`

<!--
- [ ] Inside an HTML comment: not a task
-->

    - [ ] Indented code block: not a task
