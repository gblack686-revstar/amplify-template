# Deployment Guide - AWS Amplify Frontend

This guide covers deploying the React frontend to AWS Amplify with best practices for production delivery.

## 🎯 Current Deployment Method

You are currently using **Manual ZIP Upload** deployment to AWS Amplify Console.

### How It Works
1. Build the React app locally: `npm run build`
2. Create a ZIP of the `build/` directory
3. Upload ZIP via AWS Amplify Console
4. Amplify unpacks and serves the static site

## 📦 Clean GitHub Delivery

### What Was Cleaned Up

✅ **Removed from Git**:
- `*.zip` files (80+ deployment artifacts)
- `*.tar.gz` files
- `deploy-info*.json` files
- All temporary deployment artifacts

✅ **Already in .gitignore**:
- Line 136: `*.zip`
- Line 137: `*.tar.gz`
- Line 139: `deploy-info*.json`
- Lines 156-163: Frontend build artifacts

### Before Pushing to GitHub

```bash
# 1. Verify clean status
git status

# 2. Commit the cleanup
git add .gitignore
git commit -m "chore: Remove deployment artifacts from git tracking

- Remove 80+ ZIP files from version control
- Clean up deploy-info and tar.gz files
- Keep .gitignore rules for future artifacts"

# 3. Push to GitHub
git push origin feature/linter-refactor
```

## 🚀 Deployment Options

### Option 1: Manual ZIP Upload (Current Method)

**Pros:**
- Simple and straightforward
- No git configuration needed
- Works with any git host (or no git)

**Cons:**
- Manual process each deployment
- No automatic CI/CD
- Easy to forget deployment steps

**Best Practice Workflow:**

```bash
# Create a deployment script (already in your project)
cd react-frontend

# Build the application
npm run build

# Create deployment ZIP
# On Windows (PowerShell):
Compress-Archive -Path build\* -DestinationPath amplify-deploy-$(Get-Date -Format 'yyyyMMdd-HHmmss').zip

# On Mac/Linux:
cd build && zip -r ../amplify-deploy-$(date +%Y%m%d-%H%M%S).zip * && cd ..

# Upload to Amplify Console manually
# https://console.aws.amazon.com/amplify/
```

**Automated Script (Recommended):**

Create `react-frontend/deploy.sh`:

```bash
#!/bin/bash
# Amplify Manual Deployment Script

set -e

echo "🏗️  Building React application..."
npm run build

echo "📦 Creating deployment ZIP..."
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
ZIP_NAME="amplify-deploy-${TIMESTAMP}.zip"

cd build
zip -r "../${ZIP_NAME}" .
cd ..

echo "✅ Deployment ZIP created: ${ZIP_NAME}"
echo ""
echo "📋 Next steps:"
echo "1. Go to https://console.aws.amazon.com/amplify/"
echo "2. Select your app: 'parenting-autism-navigator'"
echo "3. Click 'Deploy without git provider'"
echo "4. Upload: ${ZIP_NAME}"
echo ""
echo "🧹 Cleanup: The ZIP file is gitignored and won't be committed"
```

Make it executable: `chmod +x deploy.sh`

---

### Option 2: Git-Based Auto-Deploy (RECOMMENDED FOR PRODUCTION)

**Pros:**
- ✅ Automatic deployments on `git push`
- ✅ Full CI/CD pipeline
- ✅ Preview deployments for pull requests
- ✅ Rollback to previous versions easily
- ✅ Build logs and deployment history

**Cons:**
- Initial setup required
- Requires GitHub/GitLab/Bitbucket repository

**Setup Steps:**

#### 1. Connect GitHub to Amplify

```bash
# Option A: Via AWS Console
1. Go to AWS Amplify Console
2. Click "New app" → "Host web app"
3. Select "GitHub" as source
4. Authorize AWS Amplify to access your repository
5. Select repository: "quickstart-parenting-autism"
6. Select branch: "main" (or "develop")

# Option B: Via AWS CLI (faster)
aws amplify create-app \
  --name "parenting-autism-navigator" \
  --repository "https://github.com/YOUR-ORG/quickstart-parenting-autism" \
  --access-token "YOUR-GITHUB-TOKEN" \
  --platform WEB

# Create a branch connection
aws amplify create-branch \
  --app-id "YOUR-APP-ID" \
  --branch-name "main" \
  --enable-auto-build
```

#### 2. Configure Build Settings

Your `react-frontend/amplify.yml` is already configured:

```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - npm ci
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: build
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
```

#### 3. Set Environment Variables

In Amplify Console → App Settings → Environment Variables:

```bash
REACT_APP_API_URL=https://your-api.execute-api.us-east-1.amazonaws.com/dev
REACT_APP_USER_POOL_ID=us-east-1_XXXXXXXXX
REACT_APP_CLIENT_ID=xxxxxxxxxxxxxxxxxxxx
REACT_APP_IDENTITY_POOL_ID=us-east-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
REACT_APP_REGION=us-east-1
```

Get these values from CDK outputs:

```bash
cd infra
npx cdk deploy --outputs-file ../react-frontend/cdk-outputs.json
```

#### 4. Enable Auto-Deploy

In Amplify Console:
- App Settings → Build settings
- Enable: ✅ Auto build on code commit
- Branch auto-detection: Enable for PR previews

#### 5. Deploy via Git

```bash
# Now every push triggers a deployment!
git add .
git commit -m "feat: Add new feature"
git push origin main

# Amplify automatically:
# 1. Detects the push
# 2. Runs npm ci && npm run build
# 3. Deploys to production
# 4. Sends you a notification
```

---

### Option 3: AWS Amplify CLI (Hybrid Approach)

**Pros:**
- Command-line deployment
- No manual ZIP upload
- Works without git setup

**Cons:**
- Requires Amplify CLI installation
- Still semi-manual (not fully automated)

**Setup:**

```bash
# Install Amplify CLI
npm install -g @aws-amplify/cli

# Configure Amplify
amplify configure

# Initialize Amplify in your project
cd react-frontend
amplify init

# Publish the app
amplify publish
```

---

## 🎯 Recommended Approach for Delivery

### For GitHub Repository Delivery:

1. **Clean up git** ✅ (Already done - ZIP files removed)
2. **Push to GitHub** ✅
3. **Document deployment** ✅ (This file!)
4. **Set up git-based Amplify** (Recommended for client)

### For Client Handoff:

Include in your handoff documentation:

```markdown
## Frontend Deployment Options

### Current Setup (Manual ZIP Upload)
- Build: `cd react-frontend && npm run build`
- Upload to Amplify Console manually

### Recommended Setup (Git-Based Auto-Deploy)
1. Connect GitHub to AWS Amplify
2. Configure environment variables (see DEPLOYMENT.md)
3. Every `git push` auto-deploys to production

See DEPLOYMENT.md for detailed instructions.
```

---

## 🔧 Deployment Checklist

Before deploying to production:

- [ ] Environment variables configured in Amplify
- [ ] API Gateway URL updated in `.env` or Amplify env vars
- [ ] Cognito User Pool IDs configured
- [ ] Custom domain configured (if applicable)
- [ ] HTTPS redirects enabled
- [ ] Cache headers configured (already in `amplify.yml`)
- [ ] Error pages configured (404, 403, 500)
- [ ] Performance monitoring enabled
- [ ] Build notifications configured (Slack/Email)

---

## 📊 Monitoring & Logs

### View Deployment Logs

```bash
# Via AWS Console
AWS Amplify → Your App → Build History → Select Build → View Logs

# Via AWS CLI
aws amplify list-jobs --app-id YOUR-APP-ID --branch-name main
aws amplify get-job --app-id YOUR-APP-ID --branch-name main --job-id JOB-ID
```

### Performance Monitoring

Amplify provides:
- Build time tracking
- Deploy success/failure metrics
- Frontend performance metrics
- Real user monitoring (RUM)

---

## 🚨 Troubleshooting

### Build Fails in Amplify

**Issue**: `npm install` fails
**Solution**: Update `amplify.yml` to use `npm ci` (already configured)

**Issue**: Environment variables not working
**Solution**: Prefix all React env vars with `REACT_APP_`

**Issue**: Build succeeds but app shows blank page
**Solution**: Check browser console for API errors, verify Cognito config

### Deployment is Slow

**Issue**: Deployment takes 5+ minutes
**Solution**:
- Enable build cache (already in `amplify.yml`)
- Use `npm ci` instead of `npm install` (already configured)
- Consider reducing dependencies

---

## 📁 Files to Keep in Git

✅ **Keep:**
- `react-frontend/amplify.yml` - Build configuration
- `react-frontend/package.json` - Dependencies
- `react-frontend/public/` - Static assets
- `react-frontend/src/` - Source code

❌ **Ignore (Already gitignored):**
- `react-frontend/build/` - Built artifacts
- `react-frontend/node_modules/` - Dependencies
- `*.zip`, `*.tar.gz` - Deployment archives
- `deploy-info*.json` - Deployment metadata

---

## 🎓 Best Practices Summary

1. **For Production**: Use git-based auto-deploy (Option 2)
2. **For Development**: Manual ZIP or Amplify CLI is fine
3. **Never commit**: Built artifacts, ZIPs, or secrets
4. **Always use**: Environment variables for API endpoints
5. **Enable**: Branch previews for PR testing
6. **Configure**: Custom domain with HTTPS
7. **Monitor**: Build logs and performance metrics

---

## 📞 Support Resources

- [AWS Amplify Docs](https://docs.aws.amazon.com/amplify/)
- [Amplify Build Settings](https://docs.aws.amazon.com/amplify/latest/userguide/build-settings.html)
- [Environment Variables](https://docs.aws.amazon.com/amplify/latest/userguide/environment-variables.html)

---

**Created**: 2025-11-13
**Project**: Parenting Autism Navigator
**Deployment**: AWS Amplify Hosting
