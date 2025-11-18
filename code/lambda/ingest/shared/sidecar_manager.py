"""
Sidecar Metadata Manager
Handles creation, reading, and updating of sidecar metadata files alongside primary documents.
"""
import json
import boto3
from typing import Dict, Any, Optional, List
from datetime import datetime
import logging

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


class SidecarManager:
    """Manages sidecar metadata file operations for document lifecycle tracking"""

    SIDECAR_TYPES = {
        'metadata': '.metadata.json',
        'extracted': '.extracted.json',
        'processing': '.processing.json',
        'insights': '.insights.json',
        'audit': '.audit.json'
    }

    def __init__(self, s3_client=None, bucket_name: str = None):
        """
        Initialize SidecarManager

        Args:
            s3_client: boto3 S3 client (creates new one if None)
            bucket_name: S3 bucket name for sidecar files
        """
        self.s3 = s3_client or boto3.client('s3')
        self.bucket = bucket_name

    def get_sidecar_key(self, document_s3_key: str, sidecar_type: str) -> str:
        """
        Generate sidecar file S3 key based on document key and type

        Args:
            document_s3_key: S3 key of the primary document
            sidecar_type: Type of sidecar (metadata, extracted, processing, insights, audit)

        Returns:
            S3 key for the sidecar file

        Raises:
            ValueError: If sidecar_type is not recognized
        """
        suffix = self.SIDECAR_TYPES.get(sidecar_type)
        if not suffix:
            raise ValueError(f"Unknown sidecar type: {sidecar_type}. "
                             f"Valid types: {list(self.SIDECAR_TYPES.keys())}")
        return f"{document_s3_key}{suffix}"

    def write_sidecar(self, document_s3_key: str, sidecar_type: str,
                      data: Dict[str, Any]) -> str:
        """
        Write sidecar metadata file to S3

        Args:
            document_s3_key: S3 key of the primary document
            sidecar_type: Type of sidecar to write
            data: Dictionary data to write to sidecar

        Returns:
            S3 key of the written sidecar file
        """
        sidecar_key = self.get_sidecar_key(document_s3_key, sidecar_type)

        logger.info(f"Writing {sidecar_type} sidecar to {sidecar_key}")

        self.s3.put_object(
            Bucket=self.bucket,
            Key=sidecar_key,
            Body=json.dumps(data, indent=2, default=str),
            ContentType='application/json',
            Metadata={
                'sidecar-type': sidecar_type,
                'parent-document': document_s3_key,
                'created-at': datetime.utcnow().isoformat()
            }
        )

        logger.info(f"Successfully wrote {sidecar_type} sidecar")
        return sidecar_key

    def read_sidecar(self, document_s3_key: str,
                     sidecar_type: str) -> Optional[Dict[str, Any]]:
        """
        Read sidecar metadata file from S3

        Args:
            document_s3_key: S3 key of the primary document
            sidecar_type: Type of sidecar to read

        Returns:
            Dictionary data from sidecar file, or None if not found
        """
        sidecar_key = self.get_sidecar_key(document_s3_key, sidecar_type)

        try:
            logger.info(f"Reading {sidecar_type} sidecar from {sidecar_key}")
            response = self.s3.get_object(Bucket=self.bucket, Key=sidecar_key)
            data = json.loads(response['Body'].read())
            logger.info(f"Successfully read {sidecar_type} sidecar")
            return data
        except self.s3.exceptions.NoSuchKey:
            logger.warning(f"Sidecar not found: {sidecar_key}")
            return None
        except Exception as e:
            logger.error(f"Error reading sidecar {sidecar_key}: {str(e)}")
            raise

    def append_processing_status(self, document_s3_key: str,
                                 status: str, details: str,
                                 error_info: Optional[Dict[str, Any]] = None):
        """
        Append to processing status chain

        Args:
            document_s3_key: S3 key of the primary document
            status: Current processing status (uploaded, analyzing, complete, failed, etc.)
            details: Human-readable details about the status
            error_info: Optional error information if status is 'failed'
        """
        processing_data = self.read_sidecar(document_s3_key, 'processing') or {
            'statusChain': [],
            'currentStatus': 'pending',
            'errors': []
        }

        # Append to status chain
        processing_data['statusChain'].append({
            'status': status,
            'timestamp': datetime.utcnow().isoformat(),
            'details': details
        })

        # Update current status
        processing_data['currentStatus'] = status

        # Add error if provided
        if error_info:
            processing_data['errors'].append({
                'timestamp': datetime.utcnow().isoformat(),
                **error_info
            })

        self.write_sidecar(document_s3_key, 'processing', processing_data)
        logger.info(f"Updated processing status to: {status}")

    def append_audit_event(self, document_s3_key: str, action: str,
                           user_id: str, **kwargs):
        """
        Append to audit trail

        Args:
            document_s3_key: S3 key of the primary document
            action: Action performed (uploaded, viewed, shared, deleted, etc.)
            user_id: User who performed the action
            **kwargs: Additional event-specific data
        """
        audit_data = self.read_sidecar(document_s3_key, 'audit') or {
            'events': []
        }

        event = {
            'timestamp': datetime.utcnow().isoformat(),
            'action': action,
            'userId': user_id,
            **kwargs
        }

        audit_data['events'].append(event)
        self.write_sidecar(document_s3_key, 'audit', audit_data)
        logger.info(f"Added audit event: {action} by {user_id}")

    def get_all_sidecars(self, document_s3_key: str) -> Dict[str, Any]:
        """
        Read all sidecar files for a document

        Args:
            document_s3_key: S3 key of the primary document

        Returns:
            Dictionary mapping sidecar types to their data
        """
        sidecars = {}
        for sidecar_type in self.SIDECAR_TYPES.keys():
            data = self.read_sidecar(document_s3_key, sidecar_type)
            if data:
                sidecars[sidecar_type] = data

        logger.info(f"Retrieved {len(sidecars)} sidecars for document")
        return sidecars

    def list_document_sidecars(self, document_s3_key: str) -> List[str]:
        """
        List which sidecar types exist for a document

        Args:
            document_s3_key: S3 key of the primary document

        Returns:
            List of sidecar types that exist
        """
        existing_sidecars = []
        for sidecar_type in self.SIDECAR_TYPES.keys():
            sidecar_key = self.get_sidecar_key(document_s3_key, sidecar_type)
            try:
                self.s3.head_object(Bucket=self.bucket, Key=sidecar_key)
                existing_sidecars.append(sidecar_type)
            except self.s3.exceptions.NoSuchKey:
                continue

        return existing_sidecars

    def delete_all_sidecars(self, document_s3_key: str) -> int:
        """
        Delete all sidecar files for a document

        Args:
            document_s3_key: S3 key of the primary document

        Returns:
            Number of sidecar files deleted
        """
        deleted_count = 0
        for sidecar_type in self.SIDECAR_TYPES.keys():
            sidecar_key = self.get_sidecar_key(document_s3_key, sidecar_type)
            try:
                self.s3.delete_object(Bucket=self.bucket, Key=sidecar_key)
                deleted_count += 1
                logger.info(f"Deleted {sidecar_type} sidecar")
            except Exception as e:
                logger.warning(f"Could not delete {sidecar_type} sidecar: {str(e)}")

        logger.info(f"Deleted {deleted_count} sidecar files")
        return deleted_count

    def is_sidecar_file(self, s3_key: str) -> bool:
        """
        Check if an S3 key is a sidecar file

        Args:
            s3_key: S3 key to check

        Returns:
            True if the key is a sidecar file, False otherwise
        """
        return any(s3_key.endswith(suffix) for suffix in self.SIDECAR_TYPES.values())

    def get_document_from_sidecar_key(self, sidecar_s3_key: str) -> Optional[str]:
        """
        Extract the original document S3 key from a sidecar file key

        Args:
            sidecar_s3_key: S3 key of a sidecar file

        Returns:
            Original document S3 key, or None if not a sidecar file
        """
        for suffix in self.SIDECAR_TYPES.values():
            if sidecar_s3_key.endswith(suffix):
                return sidecar_s3_key[:-len(suffix)]
        return None
