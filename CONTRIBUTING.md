# Contributing to ChordMini

Thank you for your interest in contributing to ChordMini! This guide will help you get started with contributing to our AI-powered chord recognition application.

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
- **Tailwind CSS**: Use utility classes, avoid custom CSS when possible
- **Responsive Design**: Mobile-first approach with proper breakpoints
- **Dark Mode**: Support both light and dark themes consistently
- **Accessibility**: Include proper ARIA labels and keyboard navigation

### ESLint Configuration
Follow the existing ESLint rules:
```bash
npm run lint        # Check for linting errors
npm run lint:fix    # Auto-fix linting issues
```

## 🧪 Testing

### Testing Strategy
- **Unit Tests**: Jest + React Testing Library for component testing
- **Integration Tests**: API route testing with mock services
- **E2E Tests**: Playwright for critical user flows
- **Performance Tests**: Lighthouse CI for performance monitoring

### Running Tests
```bash
npm run test        # Run unit tests
npm run test:watch  # Run tests in watch mode
npm run test:e2e    # Run end-to-end tests
npm run build       # Verify production build
```

### Test Requirements
- **Coverage**: Maintain >80% test coverage for new features
- **Critical Paths**: All user-facing features must have tests
- **API Routes**: All API endpoints must have integration tests
- **Components**: UI components must have accessibility tests

## 🔄 Pull Request Process

### Before Submitting
1. **Fork and Branch**: Create a feature branch from `main`
2. **Code Quality**: Ensure all tests pass and linting is clean
3. **Documentation**: Update relevant documentation
4. **Build Verification**: Run `npm run build` successfully

### PR Requirements
- **Descriptive Title**: Clear, concise description of changes
- **Detailed Description**: Include motivation, changes, and testing notes
- **Issue Reference**: Link to related GitHub issues
- **Screenshots**: Include before/after screenshots for UI changes
- **Breaking Changes**: Clearly document any breaking changes

### Review Process
1. **Automated Checks**: All CI/CD checks must pass
2. **Code Review**: At least one maintainer review required
3. **Testing**: Manual testing for complex features
4. **Documentation**: Ensure documentation is updated

### Merge Criteria
- ✅ All tests passing
- ✅ Code review approved
- ✅ No merge conflicts
- ✅ Documentation updated
- ✅ Performance impact assessed

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
- **Email**: phantrongnghia510@gmail.com for direct contact
- **Documentation**: Check existing docs before asking questions

### Recognition
Contributors will be recognized in:
- **README.md**: Contributors section
- **Changelog**: Feature and fix attributions
- **Release Notes**: Major contribution highlights

---

## 📞 Contact

**Project Maintainer**: Nghia Phan
**Email**: phantrongnghia510@gmail.com

- **Repository**: https://github.com/ptnghia-j/ChordMiniApp
- **Live Demo**: https://chordmini.me

Thank you for contributing to ChordMini! 🎵