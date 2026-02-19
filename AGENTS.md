## Code Standards
* Follow `.editorconfig` setting for formatting.
* Prioritize code readability over brevity.  Use verbose variable and folder names.
* Minimize dependencies as much as possible.  Every dependency, whether dev or runtime, should be analyzed for its necessity.  If you can write a small amount of code instead of adding a dependency, prefer that.
* Minimize tooling.  If you don't need a build step, don't add it.  If you need a build step but it can be accomplished with a small script, write a build script in TypeScript (executed with Bun) rather than installing a tool.
* Limit layers of abstraction as much as possible.  Don't try to implement support for things that aren't needed yet.
* If we need to add a new feature and it doesn't fit in the current architecture, we should first refactor the existing code to make the new feature easier to implement, and then implement the new feature.
* TypeScript should all be written with the strictest configuration.
* When adding dependencies, tools, docker base images, or other external infrastructure, make sure you are getting the latest version when you initially set it up.  Once setup, don't update versions unless there is an explicit reason to do so.
* Try to minimize configuration, code, and infrastructure as much as possible to achieve the desired goals.  Every addition should be well thought through and necessary.  When deciding between options to pursue, choose the one that minimizes the total amount of code (including dependencies) while still achieving the project goals.
* `source` should be used in favor of `src` or other shorthands.
* `output` should be used in favor of `out` or `dist` or other shorthands.
* Comments should be kept to a minimum and you should favor having easy to read code with verbose variable names.  If the code is particularly esoteric or obscure a comment may be necessary, but this should be the exception and only after trying to refactor things to avoid the esoteric/obscure code.
* Where it helps, try to extract blocks of code out into pure functions that are well named.  Ideally, the code reads like english, using functions to provide named context to code blocks and also improve testability of small pure units of work.
* After you are done writing or planning some new code, take a step back and ask yourself if it could be improved before moving on.  If it can be improved, take the time to improve it.
* Prefer guard clauses over nesting code inside conditionals.  The "primary" code path for a function should ideally be at the root of a function, not nested inside conditionals.
* There are no arbitrary line lengths.  Lines should be broken apart on logical boundaries.  If a line feels particularly long, it should not be arbitrarily broken up into new lines but instead you should consider refactoring.

## Formatting and Whitespace

### Preserve existing code style
When editing files:
- Do not change indentation (tabs vs spaces) or line breaking style
- Do not "reformat" function signatures, parameter lists, arrow functions, or object literals
- Keep the existing line breaks and spacing choices exactly as they appear
- Only modify the specific lines that need to change for your task

### Examples of what NOT to do
- Turning `function foo(a, b, c)` into a multi-line version with each parameter on its own line
- Wrapping short conditional expressions that fit on one line onto multiple lines
- Changing `const obj = { a: 1, b: 2 }` to have each property on a separate line
- Converting single-line `if (condition) return` into a multi-line block

### Allowed
- If a line is already multi-line, follow that existing pattern
- If you must add many parameters to an already multi-line signature, keep the current style
- When writing large blocks of new code to an existing style, follow the style in that file
- When writing code in new files, look at `.editorconfig` as the primary source of truth, and then read the rest of the project for style reference

### Rationale
- Cosmetic changes create noise in diffs and make code reviews harder
- Projects often have team conventions that aren't captured in AGENTS.md
- The goal is task-focused edits, not reformatting


## Docker
* Only copy files into docker that are actually necessary.  Try to avoid unnecessarily copying the entire workspace into the docker image.  Using globs is appropriate sometimes, like for a source folder, but it should be used sparingly at the top level.
* Always be very explicit with base image versions, including the most specific base image version possible.  Always include a sha256 hash in the image tag.  Lookup the image in the appropriate container registry first, get a list of tags, and filter down to latest and most explicit tag.
* Use HEREDOC when you need to do multi-line RUN commands.
* When installing dependencies with apt-get, always pin to exact latest version when you add the dependency.  check both the main repository and the updates repository to make sure you are finding the most precise version.
* Dockefiles should always strive to be as reproducible as possible.  If some external server changes something (like updated a version in a repository), the docker build should either fail or continue to produce the same image hash as previous runs.
* Do sha256 checks of external downloads whenever possible.
* Utilize layer caching effectively.  If you need to install some dependencies for a project, copy the file containing the dependency list over to the Docker Image first, then do the install, then proceed to copy over remaining files.
* In multi-step builds, builder images should optimize for layer caching and build performance rather than final image size.
* In multi-step builds, the final image should optimize for image size, while retaining strong layer caching.

## TypeScript
* Never ever use `any` type.
* TypeCasts should almost never be used.  In the extremely rare case where they are necessary, they should have a comment indicating why proper types cannot be used in that scenario.
* package.json dependencies and devDependencies should have fixed versions.
* Always verify you are pulling the latest version of a package when first adding it.
* No semicolons at end of line.  If a line starts with an `(` then it should be `;(`.  In general, try to avoid starting lines with a `(`.


## Command Execution

### Always Use Package Scripts

When working on a project, you must use the scripts defined in the projects build scripting system instead of running raw tools for building, testing, packaging, and linting. For example:

- ✅ `bun run typecheck`
- ✅ `task test`
- ✅ `npm run lint`
- ❌ `bun --bun tsc --noEmit`
- ❌ `go test -race`
- ❌ `npx eslint src/`

**Why**: Package scripts may specify different config files, flags, pre/post hooks, or environment setup that are essential for correctness.
Bypassing them can lead to false positives/negatives and CI drift.
They also may change from time to time and using the script in the repository assures you always use the latest correct version.

### Pre-Action Checklist

Before executing any command that builds, tests, packages, or lints:

1. **Is there a script for this?** Check `package.json` scripts section.
2. **Use the script.** Run `bun run <script-name>` or `npm run <script-name>`.
3. **Do not recreate the command manually** unless the script does not exist and the user explicitly approves.

If a needed script is missing, ask the user to add it before proceeding.


## Bun
* Setup scripts should use `bun install --frozen-lockfile`, not `bun install`.
* Run typecheck with `bun --bun tsc --noEmit` periodically.
* Make sure you are type checking the tests as well as the project, this may require multiple tsconfig.json files.

## NodeJS
* Setup scripts should use `npm ci`, not `npm install`.
* Add a `.npmrc` file to every project with the following contents:
	```
	save-exact = true
	ignore-scripts = true
	```
