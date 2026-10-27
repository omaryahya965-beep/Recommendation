"""Server-side session control on top of SimpleJWT's blacklist."""
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken


def revoke_sessions_and_issue(user) -> dict:
    """Blacklist every refresh token the user holds and return a new pair.

    Access tokens already issued stay valid until they expire
    (ACCESS_TOKEN_LIFETIME); refresh is what keeps a session alive.
    """
    for token in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=token)
    from .serializers import RoleTokenObtainPairSerializer

    refresh = RoleTokenObtainPairSerializer.get_token(user)
    return {"access": str(refresh.access_token), "refresh": str(refresh)}
