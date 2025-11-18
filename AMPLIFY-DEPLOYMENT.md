# AWS Amplify Deployment Guide

This template is optimized for GitHub → AWS Amplify auto-deployment.

## Prerequisites

1. AWS Account with Amplify access
2. GitHub repository (this repo should already be pushed)
3. CDK infrastructure deployed (backend services)

## Setup Steps

### 1. Deploy Backend Infrastructure First

```bash
# Configure environment
cp .env.example .env
# Edit .env with your configuration

# Deploy CDK stack
cd infra
npm install
cdk bootstrap  # First time only
cdk deploy --context environment=dev
```

**Save the CDK outputs** - you'll need these for Amplify environment variables.

### 2. Connect GitHub to AWS Amplify

1. Go to [AWS Amplify Console](https://console.aws.amazon.com/amplify/)
2. Click **New app** → **Host web app**
3. Select **GitHub** as source
4. Authorize AWS Amplify to access your GitHub account
5. Select repository: `gblack686/amplify-template`
6. Select branch: `main` (or your preferred branch)

### 3. Configure Build Settings

Amplify will auto-detect the `react-frontend/amplify.yml` configuration file.

**App root directory**: `react-frontend`

The build configuration is already set:
- **Build command**: `npm run build`
- **Build output directory**: `build`
- **Cache**: `node_modules` cached for faster builds

### 4. Set Environment Variables

In Amplify Console → App Settings → Environment variables, add:

```bash
# From CDK deployment outputs
REACT_APP_API_ENDPOINT=https://your-api-id.execute-api.us-east-1.amazonaws.com/prod
REACT_APP_COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
REACT_APP_COGNITO_CLIENT_ID=XXXXXXXXXXXXXXXXXXXXXXXXXX
REACT_APP_REGION=us-east-1
REACT_APP_S3_BUCKET=your-document-bucket-name

# Optional: Environment indicator
REACT_APP_ENVIRONMENT=production
```

### 5. Deploy

1. Click **Save and deploy**
2. Amplify will automatically:
   - Clone your repository
   - Install dependencies
   - Run build
   - Deploy to CDN
   - Provide a URL (e.g., `https://main.d2xxxxx.amplifyapp.com`)

### 6. Custom Domain (Optional)

1. Go to **Domain management** in Amplify Console
2. Add domain (e.g., `app.yourdomain.com`)
3. Follow DNS configuration steps
4. Amplify provisions SSL certificate automatically

## Continuous Deployment

Once set up, Amplify automatically deploys on every push to your connected branch:

```bash
git add .
git commit -m "feat: Add new feature"
git push origin main
# Amplify automatically detects and deploys
```

## Branch-Based Deployments

Set up preview environments for branches:

1. In Amplify Console → App settings → Branch deployments
2. Add branch pattern (e.g., `develop`, `feature/*`)
3. Each branch gets its own preview URL

## Monitoring

### Build Logs
- Real-time build logs in Amplify Console
- Detailed error messages if build fails

### Metrics
- Traffic metrics in CloudWatch
- Performance monitoring in Amplify Console

### Alarms
- Set up CloudWatch alarms for errors
- Configure SNS notifications

## Rollback

If a deployment breaks production:

1. Go to Amplify Console → Deployments
2. Find last working deployment
3. Click **Redeploy this version**

Or use Git:
```bash
git revert HEAD
git push origin main
```

## Cost Optimization

**Amplify Pricing** (as of 2024):
- **Build minutes**: $0.01 per minute
- **Hosting**: $0.15 per GB served
- **Storage**: $0.023 per GB/month

**Typical costs for low-traffic app**:
- ~$5-15/month for hosting
- Minimal build costs (usually <10 min/deploy)

## Troubleshooting

### Build Fails

**Check:**
1. `react-frontend/amplify.yml` is correct
2. All environment variables are set
3. Node version compatibility (Amplify uses Node 18 by default)

**Common issues:**
- Missing environment variables → Add in Amplify Console
- Dependency errors → Check `package.json` and `package-lock.json`
- Build timeout → Contact AWS Support to increase timeout

### App Not Loading

**Check:**
1. API endpoint environment variable is correct
2. Cognito configuration matches CDK outputs
3. CORS is enabled on API Gateway
4. Browser console for errors

### Slow Builds

**Optimize:**
1. Use build cache (already enabled in `amplify.yml`)
2. Consider using custom build image if needed
3. Remove unnecessary dependencies

## Advanced Configuration

### Custom Headers

Already configured in `react-frontend/amplify.yml`:
- Static assets (JS/CSS) → 1 year cache
- HTML → No cache
- CORS headers if needed

### Redirects & Rewrites

For SPA routing, Amplify auto-configures redirects.

Custom redirects:
1. Go to Amplify Console → Rewrites and redirects
2. Add rule (e.g., `/api/*` → API Gateway)

### Environment-Specific Builds

```bash
# In Amplify Console environment variables
REACT_APP_ENVIRONMENT=production  # For main branch
REACT_APP_ENVIRONMENT=development # For develop branch
```

## Security Best Practices

1. **Environment Variables**: Never commit secrets to Git
2. **HTTPS Only**: Amplify enforces HTTPS automatically
3. **Access Control**: Use Cognito, not basic auth
4. **Headers**: Security headers already configured
5. **Secrets**: Use AWS Secrets Manager for sensitive config

## Support

- **AWS Amplify Docs**: https://docs.aws.amazon.com/amplify/
- **GitHub Issues**: Report template-specific issues
- **RevStar Support**: support@revstar.com

## Next Steps

After deployment:
1. Test all features in production
2. Set up monitoring and alerts
3. Configure custom domain
4. Set up branch previews for staging
5. Document your deployment process for your team
