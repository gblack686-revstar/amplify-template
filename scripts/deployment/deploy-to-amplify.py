"""Deploy to Amplify using proper upload"""
import boto3
import requests
import time

app_id = 'd5nc2mn12s3nr'
branch_name = 'dev'
zip_file = 'react-frontend/artifacts-fixed.zip'

client = boto3.client('amplify')

# Stop any pending jobs first
try:
    jobs_response = client.list_jobs(appId=app_id, branchName=branch_name, maxResults=5)
    for job in jobs_response['jobSummaries']:
        if job['status'] == 'PENDING':
            print(f"Cancelling job {job['jobId']}...")
            client.stop_job(appId=app_id, branchName=branch_name, jobId=job['jobId'])
            time.sleep(1)
except Exception as e:
    print(f"Error checking jobs: {e}")

# Create deployment
print("Creating deployment...")
deployment = client.create_deployment(
    appId=app_id,
    branchName=branch_name
)

job_id = deployment['jobId']
upload_url = deployment['zipUploadUrl']

print(f"Job ID: {job_id}")
print(f"Uploading {zip_file}...")

# Upload the zip file
with open(zip_file, 'rb') as f:
    response = requests.put(upload_url, data=f, headers={'Content-Type': 'application/zip'})

if response.status_code == 200:
    print("Upload successful!")

    # Start the deployment
    print("Starting deployment...")
    client.start_deployment(
        appId=app_id,
        branchName=branch_name,
        jobId=job_id
    )

    print(f"\nDeployment started! Job ID: {job_id}")
    print("Monitor at: https://console.aws.amazon.com/amplify/home?region=us-east-1#/d5nc2mn12s3nr")
else:
    print(f"Upload failed: {response.status_code}")
    print(response.text)
