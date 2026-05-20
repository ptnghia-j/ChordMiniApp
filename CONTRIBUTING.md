# Contributing to ChordMini

Thank you for your interest in contributing to ChordMini! This guide will help you get started with contributing to our open-source music analysis tool for chords, beats, lyrics, and visualization workflows.

Note: We especially welcome contribution from the research and ML community to help improve our core music analysis algorithms and models.

> [!NOTE]
> The full test suites and documentations are gradually being built out. We encourage contributions in these areas as well, and will update this guide with more specific testing and documentation guidelines as the project evolves.


## 📝 Code Style Guidelines

### TypeScript Standards
- **Strict Mode**: All TypeScript strict checks enabled
- **Type Safety**: Avoid `any` types, use proper interfaces and type definitions
- **Naming Conventions**:
  - PascalCase for components and interfaces
  - camelCase for variables and functions
  - UPPER_SNAKE_CASE for constants

### React/Next.js Best Practices
- **Components**: Use functional components with hooks
- **File Structure**: Group related components in feature folders
- **Imports**: Use absolute imports with `@/` prefix
- **Props**: Define explicit interfaces for all component props

### Styling Guidelines
- **HeroUI + Tailwind CSS**: Prefer HeroUI components with Tailwind utility class overrides; other utility or components libraries are welcomed but should be used consistently and justified enough to be added as a project dependency
- **Responsive Design**: Mobile-first approach with proper breakpoints
- **Dark Mode**: Support both light and dark themes consistently
- **Accessibility**: Include proper ARIA labels and keyboard navigation

### ESLint Configuration
Follow the existing ESLint rules:
```bash
npm run lint        # Check for linting errors
```

If a change introduces lint issues, fix them in the touched files before opening a PR.

## 🧪 Testing (To be updated)

### Testing Strategy
- **Unit Tests**: Jest + React Testing Library for components, hooks, services, and stores
- **Integration Tests**: Jest-based integration coverage for API routes and workflow-heavy features
- **E2E Tests**: Playwright for critical user flows
- **Build Verification**: `npm run build` is an important validation step before submitting changes

### Running Tests
```bash
npm run lint        # Run ESLint checks
npm run test        # Run Jest suites
npm run test:watch  # Run tests in watch mode
npm run test:e2e    # Run end-to-end tests
npm run build       # Verify production build
```

Current test suites primarily live under:
- `__tests__/unit`
- `__tests__/integration`
- `__tests__/e2e`

> [!NOTE]
> To be updated

### Test Requirements
- **Relevant Coverage**: Add or update tests for behavior changes when practical, especially for regressions and critical flows
- **Critical Paths**: User-facing features and analysis workflows should have targeted validation
- **API Routes**: API changes should include integration or focused route-level coverage where practical
- **UI Changes**: UI updates should include manual verification, and accessibility checks when the interaction changes

## 🔄 Pull Request Process

### Before Submitting
1. **Fork and Branch**: Create a feature branch from `main`
2. **Code Quality**: Ensure relevant tests pass and linting is clean
3. **Documentation**: Update relevant documentation
4. **Build Verification**: Run `npm run build` successfully

### PR Requirements
- **Descriptive Title**: Clear, concise description of changes
- **Detailed Description**: Include motivation, changes, and testing notes
- **Issue Reference**: Link to related GitHub issues
- **Screenshots**: Include before/after screenshots for UI changes
- **Breaking Changes**: Clearly document any breaking changes

### Review Process
1. **Automated Checks**: Current CI validates TypeScript compilation, ESLint, and production build
2. **Code Review**: At least one maintainer review required
3. **Testing**: Add targeted automated tests where practical and perform manual testing for complex features
4. **Documentation**: Ensure documentation is updated

### Merge Criteria
- ✅ Relevant checks passing
- ✅ Code review approved
- ✅ No merge conflicts
- ✅ Documentation updated
- ✅ Performance impact assessed when applicable

### Handling Diverged Git History

> [!IMPORTANT]
> This codebase has changed quickly and may continue to need cleanup as the project evolves. If you see a Git divergence message, pause before pulling, rebasing, or resetting. This can happen when a shared branch history was rewritten with commands such as `git commit --amend`, `git rebase`, and `git push --force-with-lease`. The code may look similar, but Git sees amended or rebased commits as different commits because their commit hashes changed.

You may see a message such as:

```bash
Your branch and 'origin/main' have diverged
```

or:

```bash
fatal: Need to specify how to reconcile divergent branches
```

Before taking any destructive action:

```bash
git status
git branch backup-before-divergence
git fetch origin
```

If you have no local changes and no local commits you need to keep, you can align your branch to the remote:

```bash
git reset --hard origin/main
```

For another branch, replace `main` with the branch name:

```bash
git reset --hard origin/branch-name
```

Warning: `git reset --hard` discards uncommitted local changes. If you have local edits, stash them first:

```bash
git stash
git fetch origin
git reset --hard origin/main
git stash pop
```

If you have local commits on top of the old history, rebase them onto the updated remote branch instead:

```bash
git fetch origin
git rebase origin/main
```

If conflicts appear, resolve them, then continue:

```bash
git add .
git rebase --continue
```

If the rebase gets confusing or risky, stop and ask for help:

```bash
git rebase --abort
```

For shared branches such as `main`, `dev`, `staging`, `production`, or shared feature branches, avoid rewriting history unless the team explicitly agrees. Prefer a normal follow-up commit or `git revert <commit>` over amending and force-pushing. Rewriting history on a personal feature branch is usually acceptable before others depend on it, but use `git push --force-with-lease` instead of plain `git push --force`.

If you rewrite a branch that others may have pulled, notify the team immediately with the branch name, what changed, and the recovery commands they should use.

## 🐛 Issue Reporting

### Bug Reports
Use the bug report template and include:
- **Environment**: OS, browser, Node.js version
- **Steps to Reproduce**: Clear, numbered steps
- **Expected vs Actual**: What should happen vs what happens
- **Screenshots/Videos**: Visual evidence when applicable
- **Console Logs**: Relevant error messages or warnings

### Feature Requests
- **Use Case**: Describe the problem you're trying to solve
- **Proposed Solution**: Your suggested approach
- **Alternatives**: Other solutions you've considered
- **Additional Context**: Screenshots, mockups, or examples

### Performance Issues
- **Metrics**: Include specific performance measurements
- **Environment**: Device specs, network conditions
- **Reproduction**: Steps to reproduce the performance issue
- **Impact**: How it affects user experience

## 🎯 Contribution Areas

### 🤖 Machine Learning & Audio Processing
- **Chord Recognition**: Improve ML model accuracy and performance
- **Beat Detection**: Enhance timing precision and algorithm efficiency
- **Audio Analysis**: Optimize audio preprocessing and feature extraction
- **Model Integration**: Add support for new ML models or frameworks

### 🎨 UI/UX Design
- **Component Library**: Enhance HeroUI component implementations
- **Responsive Design**: Improve mobile and tablet experiences
- **Accessibility**: Implement WCAG 2.1 AA compliance
- **Design System**: Maintain consistent visual language

### 🔧 Backend & Infrastructure
- **API Optimization**: Improve response times and error handling
- **Caching Strategy**: Enhance Firebase and blob storage efficiency
- **Rate Limiting**: Implement robust rate limiting and quota management
- **Monitoring**: Add comprehensive logging and performance monitoring

### 📱 Features & Functionality
- **Lyrics Integration**: Enhance synchronization and translation features
- **Audio Playback**: Improve player controls and visualization
- **Export Features**: Add chord sheet export in various formats
- **Social Features**: User accounts, playlists, and sharing capabilities

### 📚 Documentation & Testing
- **API Documentation**: Comprehensive API reference and examples
- **User Guides**: Step-by-step tutorials and feature explanations
- **Developer Docs**: Architecture guides and contribution workflows
- **Test Coverage**: Expand unit, integration, and E2E test suites

## 🤝 Community Guidelines

### Code of Conduct
- **Respectful Communication**: Be kind, constructive, and professional
- **Inclusive Environment**: Welcome contributors of all backgrounds and skill levels
- **Collaborative Spirit**: Help others learn and grow
- **Quality Focus**: Prioritize code quality and user experience

### Getting Help
- **GitHub Discussions**: For questions and community discussions
- **Issues**: For bug reports and feature requests
- **Documentation**: Check existing docs before asking questions

### Recognition
Contributors will be recognized in:
- **README.md**: Contributors section
- **Changelog**: Feature and fix attributions
- **Release Notes**: Major contribution highlights

---

## 📞 Contact

- **Repository**: https://github.com/ptnghia-j/ChordMiniApp
- **Live Demo**: https://chordmini.me
- **Maintainer**: Nghia Phan ([@ptnghia-j](https://github.com/ptnghia-j))
- **Email**: phantrongnghia510@gmail.com

Thank you for contributing to ChordMini! 🎵
