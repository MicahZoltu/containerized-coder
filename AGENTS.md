## Code Standards
* Prioritize code readability over brevity.  Use verbose variable and folder names.
* Minimize dependencies as much as possible.  Every dependency, whether dev or runtime, should be analyzed for its necessity.  If you can write a small amount of code instead of adding a dependency, prefer that.
* Minimize tooling.  If you don't need a build step, don't add it.  If you need a build step but it can be accomplished with a small script, write a build script in TypeScript (executed with Bun) rather than installing a tool.
* TypeScript should all be written with the strictest configuration.
* When adding dependencies, tools, docker base images, or other external infrastructure, make sure you are getting the latest version when you initially set it up.  Once setup, don't update versions unless there is an explicit reason to do so.
* Try to minimize configuration, code, and infrastructure as much as possible to achieve the desired goals.  Every addition should be well thought through and necessary.  When deciding between options to pursue, choose the one that minimizes the total amount of code (including dependencies) while still achieving the project goals.
* `source` should be used in favor of `src` or other shorthands.
* `output` should be used in favor of `out` or `dist` or other shorthands.

### Docker
* Only copy files into docker that are actually necessary.  Try to avoid unnecessarily copying the entire workspace into the docker image.  Using globs is appropriate sometimes, like for a source folder, but it should be used sparingly at the top level.
* Always be very explicit with base image versions, including the most specific base image version possible.  Always include a sha256 hash in the image tag.  Lookup the image in the appropriate container registry first, get a list of tags, and filter down to latest and most explicit tag.
* Use HEREDOC when you need to do multi-line RUN commands.
* When installing dependencies with apt-get, always pin to exact latest version when you add the dependency.  check both the main repository and the updates repository to make sure you are finding the most precise version.
* Dockefiles should always strive to be as reproducible as possible.  If some external server changes something (like updated a version in a repository), the docker build should either fail or continue to produce the same image hash as previous runs.
* Do sha256 checks of external downloads whenever possible.
* Utilize layer caching effectively.  If you need to install some dependencies for a project, copy the file containing the dependency list over to the Docker Image first, then do the install, then proceed to copy over remaining files.
* In multi-step builds, builder images should optimize for layer caching and build performance rather than final image size.
* In multi-step builds, the final image should optimize for image size, while retaining strong layer caching.

## NodeJS
* package.json dependencies and devDependencies should have fixed versions.
* Setup scripts should use `npm ci`, not `npm install`.
* Always verify you are pulling the latest version of a package when first adding it.
* Add a `.npmrc` file to every project with the following contents:
	```
	save-exact = true
	ignore-scripts = true
	```
