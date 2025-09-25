# Firebase Configuration

This directory contains Firebase-related configuration files.

## Files

- `firebase.json` - Main Firebase configuration
- `firestore.rules` - Firestore security rules
- `firestore.indexes.json` - Firestore database indexes
- `storage.rules` - Firebase Storage security rules

## Usage

Firebase CLI commands should be run from the root directory, but will automatically find these configuration files:

```bash
# Deploy from root directory
firebase deploy

# Deploy specific services
firebase deploy --only firestore:rules
firebase deploy --only storage
```

## Note

The `.firebaserc` file remains in the root directory as it contains project-specific settings that Firebase CLI expects to find there.
