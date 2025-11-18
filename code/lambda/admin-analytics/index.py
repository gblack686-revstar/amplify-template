"""
Admin Analytics Lambda
Aggregates metrics from DynamoDB tables for admin dashboard
"""
import json
import os
import boto3
from datetime import datetime, timedelta, timezone
import logging
from typing import Dict, Any, Optional
from decimal import Decimal
from boto3.dynamodb.conditions import Attr

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')
cognito_client = boto3.client('cognito-idp')

USER_PROFILES_TABLE = os.environ.get('USER_PROFILES_TABLE_NAME')
DOCUMENT_METADATA_TABLE = os.environ.get('DOCUMENT_METADATA_TABLE_NAME')
FEEDBACK_TABLE = os.environ.get('FEEDBACK_TABLE_NAME')
LOGGING_TABLE = os.environ.get('LOGGING_TABLE_NAME')
USER_POOL_ID = os.environ.get('USER_POOL_ID')

user_profiles_table = dynamodb.Table(USER_PROFILES_TABLE)
document_metadata_table = dynamodb.Table(DOCUMENT_METADATA_TABLE)
feedback_table = dynamodb.Table(FEEDBACK_TABLE)
logging_table = dynamodb.Table(LOGGING_TABLE)


def decimal_default(obj):
    """JSON encoder for Decimal objects"""
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError


def check_admin_role(event: Dict[str, Any]) -> bool:
    """
    Check if the user has admin role from Cognito groups
    """
    try:
        claims = event['requestContext']['authorizer']['claims']
        cognito_groups = claims.get('cognito:groups', '')

        # cognito:groups is a comma-separated string
        if isinstance(cognito_groups, str):
            groups = [g.strip() for g in cognito_groups.split(',')]
        else:
            groups = cognito_groups if isinstance(cognito_groups, list) else []

        return 'admins' in groups
    except (KeyError, TypeError) as e:
        logger.error(f"Error checking admin role: {str(e)}")
        return False


def get_family_count(admin_cache: Dict[str, bool] = None) -> int:
    """Get total number of families (unique users with profiles), excluding admin users"""
    try:
        if admin_cache is None:
            admin_cache = {}

        response = user_profiles_table.scan()

        # Filter out admin users
        non_admin_count = 0
        for item in response.get('Items', []):
            user_id = item.get('userId')
            if user_id:
                if user_id not in admin_cache:
                    admin_cache[user_id] = is_admin_user(user_id)
                if not admin_cache[user_id]:
                    non_admin_count += 1

        return non_admin_count
    except Exception as e:
        logger.error(f"Error getting family count: {str(e)}")
        return 0


def get_children_count(admin_cache: Dict[str, bool] = None) -> int:
    """Get total number of children from all profiles, excluding admin users"""
    try:
        if admin_cache is None:
            admin_cache = {}

        response = user_profiles_table.scan()
        total_children = 0

        for item in response.get('Items', []):
            user_id = item.get('userId')
            # Skip admin users
            if user_id:
                if user_id not in admin_cache:
                    admin_cache[user_id] = is_admin_user(user_id)
                if admin_cache[user_id]:
                    continue

            profile = item.get('profile', {})
            children = profile.get('children', [])
            total_children += len(children)

        return total_children
    except Exception as e:
        logger.error(f"Error getting children count: {str(e)}")
        return 0


def get_document_stats() -> Dict[str, Any]:
    """Get document statistics by type and user"""
    try:
        response = document_metadata_table.scan()
        items = response.get('Items', [])

        total_documents = len(items)
        documents_by_type = {}
        documents_by_user = {}

        for item in items:
            # Count by document type
            doc_type = item.get('documentType', 'other')
            documents_by_type[doc_type] = documents_by_type.get(doc_type, 0) + 1

            # Count by user
            user_id = item.get('userId')
            if user_id:
                documents_by_user[user_id] = documents_by_user.get(user_id, 0) + 1

        # Calculate average documents per family
        avg_docs_per_family = (
            total_documents / len(documents_by_user)
            if documents_by_user else 0
        )

        return {
            'total': total_documents,
            'by_type': documents_by_type,
            'average_per_family': round(avg_docs_per_family, 2),
            'families_with_docs': len(documents_by_user)
        }
    except Exception as e:
        logger.error(f"Error getting document stats: {str(e)}")
        return {
            'total': 0,
            'by_type': {},
            'average_per_family': 0,
            'families_with_docs': 0
        }


def get_conversation_stats(time_filter_hours: int = None, admin_cache: Dict[str, bool] = None) -> Dict[str, Any]:
    """Get conversation/chat statistics from logging table (excludes admin users)"""
    try:
        if admin_cache is None:
            admin_cache = {}

        # Calculate time threshold
        if time_filter_hours:
            time_threshold = (datetime.now(timezone.utc) - timedelta(hours=time_filter_hours)).isoformat()
        else:
            time_threshold = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()

        response = logging_table.scan(
            FilterExpression=Attr('timestamp').gte(time_threshold) & Attr('requestType').eq('query')
        )

        items = response.get('Items', [])

        # Filter out admin users using cache
        non_admin_items = []
        for item in items:
            user_id = item.get('userId')
            # Skip entries with missing or empty userId
            if user_id and user_id.strip():
                if user_id not in admin_cache:
                    admin_cache[user_id] = is_admin_user(user_id)
                if not admin_cache[user_id]:
                    non_admin_items.append(item)

        total_conversations = len(non_admin_items)

        # Count unique sessions
        unique_sessions = set()
        for item in non_admin_items:
            session_id = item.get('sessionId')
            if session_id:
                unique_sessions.add(session_id)

        period_days = time_filter_hours / 24 if time_filter_hours else 30

        return {
            'total_queries': total_conversations,
            'unique_sessions': len(unique_sessions),
            'period_days': period_days
        }
    except Exception as e:
        logger.error(f"Error getting conversation stats: {str(e)}")
        return {
            'total_queries': 0,
            'unique_sessions': 0,
            'period_days': 30
        }


def get_feedback_stats(time_filter_hours: int = None, admin_cache: Dict[str, bool] = None) -> Dict[str, Any]:
    """
    Get feedback statistics - PRIMARY KPI
    Target: 80%+ positive feedback
    Excludes admin users
    """
    try:
        if admin_cache is None:
            admin_cache = {}

        # Calculate time threshold if provided
        if time_filter_hours:
            time_threshold = (datetime.now(timezone.utc) - timedelta(hours=time_filter_hours)).isoformat()
            response = feedback_table.scan(
                FilterExpression=Attr('createdAt').gte(time_threshold)
            )
        else:
            response = feedback_table.scan()

        items = response.get('Items', [])

        positive_count = 0
        negative_count = 0

        # Filter out admin users and count feedback using cache
        for item in items:
            user_id = item.get('userId')
            if user_id:
                if user_id not in admin_cache:
                    admin_cache[user_id] = is_admin_user(user_id)
                if admin_cache[user_id]:
                    continue  # Skip admin feedback

            feedback_type = item.get('feedbackType', '').lower()
            if feedback_type == 'positive':
                positive_count += 1
            elif feedback_type == 'negative':
                negative_count += 1

        total_feedback = positive_count + negative_count

        if total_feedback > 0:
            positive_percentage = (positive_count / total_feedback) * 100
            negative_percentage = (negative_count / total_feedback) * 100
        else:
            positive_percentage = 0
            negative_percentage = 0

        # Check if meeting 80% target
        meets_target = positive_percentage >= 80.0

        return {
            'total_feedback': total_feedback,
            'positive_count': positive_count,
            'negative_count': negative_count,
            'positive_percentage': round(positive_percentage, 2),
            'negative_percentage': round(negative_percentage, 2),
            'meets_80_percent_target': meets_target
        }
    except Exception as e:
        logger.error(f"Error getting feedback stats: {str(e)}")
        return {
            'total_feedback': 0,
            'positive_count': 0,
            'negative_count': 0,
            'positive_percentage': 0,
            'negative_percentage': 0,
            'meets_80_percent_target': False
        }


def get_onboarding_stats(time_filter_hours: int = None, admin_cache: Dict[str, bool] = None) -> Dict[str, Any]:
    """Get onboarding completion statistics from logging table (excludes admin users)"""
    try:
        if admin_cache is None:
            admin_cache = {}

        # Calculate time threshold
        if time_filter_hours:
            time_threshold = (datetime.now(timezone.utc) - timedelta(hours=time_filter_hours)).isoformat()
            response = logging_table.scan(
                FilterExpression=Attr('timestamp').gte(time_threshold) & Attr('requestType').eq('onboarding_complete')
            )
        else:
            response = logging_table.scan(
                FilterExpression=Attr('requestType').eq('onboarding_complete')
            )

        items = response.get('Items', [])

        # Filter out admin users using cache
        non_admin_items = []
        for item in items:
            user_id = item.get('userId')
            # Skip entries with missing or empty userId
            if user_id and user_id.strip():
                if user_id not in admin_cache:
                    admin_cache[user_id] = is_admin_user(user_id)
                if not admin_cache[user_id]:
                    non_admin_items.append(item)

        total_completed = len(non_admin_items)

        return {
            'total_completed': total_completed
        }
    except Exception as e:
        logger.error(f"Error getting onboarding stats: {str(e)}")
        return {
            'total_completed': 0
        }


def fetch_onboardings_and_feedbacks(time_filter_hours: Optional[int]) -> tuple:
    """Fetch onboarding completions and positive feedbacks from logging table"""
    if time_filter_hours:
        time_threshold = (datetime.now(timezone.utc) - timedelta(hours=time_filter_hours)).isoformat()
        onboarding_response = logging_table.scan(
            FilterExpression=Attr('timestamp').gte(time_threshold) & Attr('requestType').eq('onboarding_complete')
        )
        feedback_response = logging_table.scan(
            FilterExpression=Attr('timestamp').gte(time_threshold) & Attr('requestType').eq('feedback_positive')
        )
    else:
        onboarding_response = logging_table.scan(
            FilterExpression=Attr('requestType').eq('onboarding_complete')
        )
        feedback_response = logging_table.scan(
            FilterExpression=Attr('requestType').eq('feedback_positive')
        )

    return onboarding_response.get('Items', []), feedback_response.get('Items', [])


def build_onboarding_times_map(onboardings: list, admin_cache: Dict[str, bool]) -> Dict[str, datetime]:
    """Build map of userId to onboarding completion time (excluding admins)"""
    onboarding_times = {}
    for onboarding in onboardings:
        user_id = onboarding.get('userId')
        timestamp = onboarding.get('timestamp')

        if user_id and user_id.strip() and timestamp:
            if user_id not in admin_cache:
                admin_cache[user_id] = is_admin_user(user_id)
            if not admin_cache[user_id]:
                onboarding_times[user_id] = datetime.fromisoformat(timestamp)
                logger.info(f"User {user_id[:8]}... onboarded at {timestamp}")

    return onboarding_times


def build_user_feedbacks_map(positive_feedbacks: list, admin_cache: Dict[str, bool]) -> Dict[str, list]:
    """Build map of userId to feedback times (excluding admins)"""
    user_feedbacks = {}
    for feedback in positive_feedbacks:
        user_id = feedback.get('userId')
        feedback_time = feedback.get('timestamp')

        if user_id and user_id.strip() and feedback_time:
            if user_id not in admin_cache:
                admin_cache[user_id] = is_admin_user(user_id)
            if not admin_cache[user_id]:
                if user_id not in user_feedbacks:
                    user_feedbacks[user_id] = []
                user_feedbacks[user_id].append(datetime.fromisoformat(feedback_time))

    return user_feedbacks


def calculate_time_to_wins(onboarding_times: Dict[str, datetime], user_feedbacks: Dict[str, list]) -> list:
    """Calculate time to first positive feedback for each user"""
    time_to_wins = []
    for user_id, feedback_times in user_feedbacks.items():
        if user_id in onboarding_times and len(feedback_times) >= 1:
            onboarding_time = onboarding_times[user_id]
            feedback_times.sort()
            first_feedback_time = feedback_times[0]

            # Calculate time difference in hours
            time_diff = (first_feedback_time - onboarding_time).total_seconds() / 3600

            logger.info(f"User {user_id[:8]}... - Onboarding: {onboarding_time}, "
                        f"First Feedback: {first_feedback_time}, Diff: {time_diff:.2f}h")

            # Only count if feedback came after onboarding and within 90 days
            if 0 < time_diff < 2160:
                time_to_wins.append(time_diff)
            else:
                logger.warning(f"User {user_id[:8]}... - Time diff {time_diff:.2f}h outside valid range (0-2160h)")

    return time_to_wins


def get_time_to_first_win(time_filter_hours: int = None, admin_cache: Dict[str, bool] = None) -> Dict[str, Any]:
    """
    Calculate average time (in hours) between onboarding completion and FIRST positive feedback
    Excludes admin users from the calculation
    """
    try:
        if admin_cache is None:
            admin_cache = {}

        # Fetch data
        onboardings, positive_feedbacks = fetch_onboardings_and_feedbacks(time_filter_hours)
        logger.info(f"Time to First Win: Found {len(onboardings)} onboardings, {len(positive_feedbacks)} positive feedbacks")

        # Build maps excluding admin users
        onboarding_times = build_onboarding_times_map(onboardings, admin_cache)
        user_feedbacks = build_user_feedbacks_map(positive_feedbacks, admin_cache)

        # Calculate time to wins
        time_to_wins = calculate_time_to_wins(onboarding_times, user_feedbacks)

        logger.info(f"Time to First Win: Calculated {len(time_to_wins)} valid samples")

        if time_to_wins:
            avg_hours = sum(time_to_wins) / len(time_to_wins)
            return {
                'average_hours': round(avg_hours, 2),
                'average_days': round(avg_hours / 24, 2),
                'sample_size': len(time_to_wins)
            }
        else:
            logger.warning("Time to First Win: No valid samples found")
            return {
                'average_hours': 0,
                'average_days': 0,
                'sample_size': 0
            }
    except Exception as e:
        logger.error(f"Error calculating time to first win: {str(e)}", exc_info=True)
        return {
            'average_hours': 0,
            'average_days': 0,
            'sample_size': 0
        }


def get_engagement_retention(time_filter_hours: int = None, admin_cache: Dict[str, bool] = None) -> Dict[str, Any]:
    """
    Calculate engagement retention: users with multiple sessions over time
    Returns percentage of users who return after their first session
    Excludes admin users
    """
    try:
        if admin_cache is None:
            admin_cache = {}

        # Get all query activities (chat sessions)
        if time_filter_hours:
            time_threshold = (datetime.now(timezone.utc) - timedelta(hours=time_filter_hours)).isoformat()
            response = logging_table.scan(
                FilterExpression=Attr('timestamp').gte(time_threshold) & Attr('requestType').eq('query')
            )
        else:
            response = logging_table.scan(
                FilterExpression=Attr('requestType').eq('query')
            )

        items = response.get('Items', [])

        # Group queries by user (excluding admin users using cache)
        user_activity = {}
        for item in items:
            user_id = item.get('userId')
            timestamp = item.get('timestamp')
            # Skip entries with missing or empty userId
            if user_id and user_id.strip() and timestamp:
                if user_id not in admin_cache:
                    admin_cache[user_id] = is_admin_user(user_id)
                if not admin_cache[user_id]:
                    if user_id not in user_activity:
                        user_activity[user_id] = []
                    user_activity[user_id].append(datetime.fromisoformat(timestamp))

        # Calculate retention metrics
        total_users = len(user_activity)
        returning_users = 0
        avg_sessions_per_user = 0

        if total_users > 0:
            total_sessions = sum(len(sessions) for sessions in user_activity.values())
            avg_sessions_per_user = total_sessions / total_users

            # Count users who came back (had sessions on different days)
            for sessions in user_activity.values():
                if len(sessions) > 1:
                    # Check if sessions span multiple days
                    unique_days = set(s.date() for s in sessions)
                    if len(unique_days) > 1:
                        returning_users += 1

            retention_rate = (returning_users / total_users) * 100 if total_users > 0 else 0

            return {
                'total_active_users': total_users,
                'returning_users': returning_users,
                'retention_rate': round(retention_rate, 2),
                'avg_sessions_per_user': round(avg_sessions_per_user, 2)
            }
        else:
            return {
                'total_active_users': 0,
                'returning_users': 0,
                'retention_rate': 0,
                'avg_sessions_per_user': 0
            }
    except Exception as e:
        logger.error(f"Error calculating engagement retention: {str(e)}")
        return {
            'total_active_users': 0,
            'returning_users': 0,
            'retention_rate': 0,
            'avg_sessions_per_user': 0
        }


def fetch_roadmap_items(time_filter_hours: Optional[int]) -> tuple:
    """Fetch roadmap additions and completions from logging table"""
    if time_filter_hours:
        time_threshold = (datetime.now(timezone.utc) - timedelta(hours=time_filter_hours)).isoformat()
        completions_response = logging_table.scan(
            FilterExpression=Attr('timestamp').gte(time_threshold) & Attr('requestType').eq('roadmap_item_completed')
        )
        additions_response = logging_table.scan(
            FilterExpression=Attr('timestamp').gte(time_threshold) & (
                Attr('requestType').eq('roadmap_item_added')
                | Attr('requestType').eq('roadmap_item_added_from_chat')
                | Attr('requestType').eq('recommendation_generated')
            )
        )
    else:
        completions_response = logging_table.scan(
            FilterExpression=Attr('requestType').eq('roadmap_item_completed')
        )
        additions_response = logging_table.scan(
            FilterExpression=Attr('requestType').eq('roadmap_item_added')
            | Attr('requestType').eq('roadmap_item_added_from_chat')
            | Attr('requestType').eq('recommendation_generated')
        )

    return completions_response.get('Items', []), additions_response.get('Items', [])


def filter_non_admin_items(items: list, admin_cache: Dict[str, bool]) -> list:
    """Filter out admin users from roadmap items"""
    non_admin_items = []
    for item in items:
        user_id = item.get('userId')
        if user_id and user_id.strip():
            if user_id not in admin_cache:
                admin_cache[user_id] = is_admin_user(user_id)
            if not admin_cache[user_id]:
                non_admin_items.append(item)
    return non_admin_items


def count_by_category(items: list) -> Dict[str, int]:
    """Count roadmap items by category"""
    category_counts = {}
    for item in items:
        metadata = item.get('metadata', {})
        category = metadata.get('category', 'unknown')
        category_counts[category] = category_counts.get(category, 0) + 1
    return category_counts


def calculate_avg_recommendations(total_items: int, items: list) -> float:
    """Calculate average recommendations per user"""
    unique_users = set()
    for item in items:
        user_id = item.get('userId')
        if user_id and user_id.strip():
            unique_users.add(user_id)

    return total_items / len(unique_users) if len(unique_users) > 0 else 0


def get_roadmap_completion_stats(time_filter_hours: int = None, admin_cache: Dict[str, bool] = None) -> Dict[str, Any]:
    """
    Calculate roadmap item completion statistics from logging table
    Tracks completions via 'roadmap_item_completed' activity type
    Excludes admin users
    """
    try:
        if admin_cache is None:
            admin_cache = {}

        # Fetch roadmap data
        completions, additions = fetch_roadmap_items(time_filter_hours)

        # Filter out admin users
        non_admin_additions = filter_non_admin_items(additions, admin_cache)
        non_admin_completions = filter_non_admin_items(completions, admin_cache)

        total_items_created = len(non_admin_additions)
        total_items_completed = len(non_admin_completions)

        # Calculate metrics
        avg_recommendations_per_user = calculate_avg_recommendations(total_items_created, non_admin_additions)
        category_breakdown = count_by_category(non_admin_additions)
        category_completions = count_by_category(non_admin_completions)
        completion_rate = (total_items_completed / total_items_created * 100) if total_items_created > 0 else 0

        return {
            'total_items_created': total_items_created,
            'total_items_completed': total_items_completed,
            'completion_rate': round(completion_rate, 2),
            'avg_recommendations_per_user': round(avg_recommendations_per_user, 2),
            'by_category': category_breakdown,
            'completions_by_category': category_completions
        }
    except Exception as e:
        logger.error(f"Error calculating roadmap stats: {str(e)}")
        return {
            'total_items_created': 0,
            'total_items_completed': 0,
            'completion_rate': 0,
            'avg_recommendations_per_user': 0,
            'by_category': {},
            'completions_by_category': {}
        }


def is_admin_user(user_id: str) -> bool:
    """
    Check if user is an admin by querying Cognito groups.
    Also checks if user has NO profile as a backup indicator.
    """
    try:
        if not USER_POOL_ID or not user_id:
            logger.warning("Missing USER_POOL_ID or user_id for admin check")
            return False

        # Backup check: If user has NO profile, they're likely an admin
        # Regular users MUST have profiles after onboarding
        try:
            profile_response = user_profiles_table.get_item(Key={'userId': user_id})
            has_profile = 'Item' in profile_response
            logger.info(f"User {user_id[:8]}... has profile: {has_profile}")
        except Exception as profile_err:
            logger.warning(f"Error checking profile for {user_id[:8]}...: {str(profile_err)}")
            has_profile = True  # Assume they have profile on error

        # Query Cognito using the sub attribute filter
        try:
            cognito_response = cognito_client.list_users(
                UserPoolId=USER_POOL_ID,
                Filter=f'sub = "{user_id}"',
                Limit=1
            )
        except Exception as cognito_err:
            logger.error(f"Cognito list_users failed for {user_id[:8]}...: {str(cognito_err)}")
            # If Cognito fails AND user has no profile, assume admin
            return not has_profile

        if cognito_response.get('Users'):
            user = cognito_response['Users'][0]
            username = user.get('Username')
            logger.info(f"Found Cognito user: {username}")

            if username:
                # Check user's groups
                try:
                    groups_response = cognito_client.admin_list_groups_for_user(
                        UserPoolId=USER_POOL_ID,
                        Username=username
                    )

                    for group in groups_response.get('Groups', []):
                        if group.get('GroupName') == 'admins':
                            logger.info(f"User {username} IS in admins group")
                            return True

                    logger.info(f"User {username} is NOT in admins group")
                except Exception as groups_err:
                    logger.error(f"Error checking groups for {username}: {str(groups_err)}")
                    # If group check fails AND user has no profile, assume admin
                    return not has_profile

        # User not found in Cognito but has activity - check profile
        logger.warning(f"User {user_id[:8]}... not found in Cognito")
        return not has_profile

    except Exception as e:
        logger.error(f"Unexpected error checking if user {user_id[:8]}... is admin: {str(e)}", exc_info=True)
        # On unexpected errors, be conservative and don't filter out
        return False


def is_valid_user(user_id: str) -> bool:
    """
    Check if user exists in Cognito.
    Returns True if user exists (admin or not), False if user doesn't exist or is deleted.
    """
    try:
        if not USER_POOL_ID or not user_id:
            return False

        # Query Cognito using the sub attribute filter
        cognito_response = cognito_client.list_users(
            UserPoolId=USER_POOL_ID,
            Filter=f'sub = "{user_id}"',
            Limit=1
        )

        return len(cognito_response.get('Users', [])) > 0
    except Exception as e:
        logger.error(f"Error checking if user {user_id} is valid: {str(e)}")
        return False


def get_weekly_active_families(admin_cache: Dict[str, bool] = None) -> Dict[str, Any]:
    """
    Calculate percentage of families that have been active in the last 7 days
    Activity includes: queries, document uploads, feedback, or any logging table activity
    EXCLUDES admin users from the count
    """
    try:
        if admin_cache is None:
            admin_cache = {}

        # Get total family count using shared cache
        total_families = get_family_count(admin_cache)

        if total_families == 0:
            return {
                'total_families': 0,
                'active_families_last_7_days': 0,
                'active_percentage': 0,
                'inactive_families': 0
            }

        # Get activity in last 7 days (168 hours)
        time_threshold = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()

        response = logging_table.scan(
            FilterExpression=Attr('timestamp').gte(time_threshold)
        )

        items = response.get('Items', [])
        logger.info(f"Weekly Active Families: Found {len(items)} activity log entries in last 7 days")

        # Get unique users who were active (excluding admins)
        # Use shared admin cache to avoid repeated Cognito API calls
        active_users = set()
        for item in items:
            user_id = item.get('userId')
            # Skip entries with missing or empty userId
            if user_id and user_id.strip():
                # Check cache first
                if user_id not in admin_cache:
                    admin_cache[user_id] = is_admin_user(user_id)
                    logger.info(f"Weekly Active: User {user_id[:8]}... is_admin={admin_cache[user_id]}")

                if not admin_cache[user_id]:
                    active_users.add(user_id)

        active_count = len(active_users)
        active_percentage = (active_count / total_families) * 100 if total_families > 0 else 0
        inactive_count = total_families - active_count

        logger.info(f"Weekly Active Families: {active_count} active out of {total_families} total ({active_percentage:.2f}%)")
        logger.info(f"Active user IDs: {[uid[:8] + '...' for uid in active_users]}")

        return {
            'total_families': total_families,
            'active_families_last_7_days': active_count,
            'active_percentage': round(active_percentage, 2),
            'inactive_families': inactive_count
        }
    except Exception as e:
        logger.error(f"Error calculating weekly active families: {str(e)}")
        return {
            'total_families': 0,
            'active_families_last_7_days': 0,
            'active_percentage': 0,
            'inactive_families': 0
        }


def lambda_handler(event, context):
    """
    Handle admin analytics requests

    GET /admin/analytics?timeFilter=1 (hours) - Get all dashboard metrics filtered by time

    Time filter options:
    - 1 = last hour
    - 24 = last day
    - 168 = last 7 days (7*24)
    - 720 = last 30 days (30*24)
    - 2160 = last 90 days (90*24)
    """
    logger.info(f"Received event: {json.dumps(event)}")

    try:
        # Check admin authorization
        if not check_admin_role(event):
            return {
                'statusCode': 403,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({'error': 'Forbidden: Admin access required'})
            }

        http_method = event.get('httpMethod', 'GET')

        if http_method != 'GET':
            return {
                'statusCode': 405,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({'error': 'Method not allowed'})
            }

        # Parse time filter parameter
        query_params = event.get('queryStringParameters') or {}
        time_filter_hours = None
        if 'timeFilter' in query_params:
            try:
                time_filter_hours = int(query_params['timeFilter'])
            except ValueError:
                logger.warning(f"Invalid timeFilter parameter: {query_params['timeFilter']}")

        # Gather all metrics
        logger.info(f"Gathering analytics metrics (time_filter={time_filter_hours} hours)...")

        # Create request-level admin cache to reduce Cognito API calls
        admin_cache = {}
        logger.info("Created request-level admin cache for Cognito calls")

        family_count = get_family_count(admin_cache)
        children_count = get_children_count(admin_cache)
        document_stats = get_document_stats()
        conversation_stats = get_conversation_stats(time_filter_hours, admin_cache)
        feedback_stats = get_feedback_stats(time_filter_hours, admin_cache)
        onboarding_stats = get_onboarding_stats(time_filter_hours, admin_cache)
        time_to_first_win_stats = get_time_to_first_win(time_filter_hours, admin_cache)
        engagement_retention_stats = get_engagement_retention(time_filter_hours, admin_cache)
        roadmap_stats = get_roadmap_completion_stats(time_filter_hours, admin_cache)
        weekly_active_families_stats = get_weekly_active_families(admin_cache)

        logger.info(f"Admin cache stats - Unique users checked: {len(admin_cache)}, Admin users: {sum(1 for is_admin in admin_cache.values() if is_admin)}")

        analytics_data = {
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'time_filter_hours': time_filter_hours,
            'families': {
                'total': family_count,
                'with_documents': document_stats['families_with_docs']
            },
            'children': {
                'total': children_count,
                'average_per_family': round(children_count / family_count, 2) if family_count > 0 else 0
            },
            'documents': document_stats,
            'conversations': conversation_stats,
            'feedback': feedback_stats,
            'onboarding': onboarding_stats,
            'time_to_first_win': time_to_first_win_stats,
            'engagement_retention': engagement_retention_stats,
            'roadmap': roadmap_stats,
            'weekly_active_families': weekly_active_families_stats
        }

        logger.info("Analytics data compiled successfully")

        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Api-Key,Authorization',
                'Access-Control-Allow-Methods': 'OPTIONS,GET'
            },
            'body': json.dumps(analytics_data, default=decimal_default)
        }

    except Exception as e:
        logger.error(f"Error processing analytics request: {str(e)}", exc_info=True)
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({'error': 'Internal server error'})
        }
