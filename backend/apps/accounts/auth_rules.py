"""Authentication rule applied to every JWT presented to the API.

SimpleJWT's default rule accepts any token whose user still exists and is
active. That is already what we want, but it is spelled out here so the
intent is explicit and testable: deactivating a user in the admin must end
their session at the next request, not at the next token expiry.
"""


def active_user_only(user) -> bool:
    return bool(user is not None and user.is_active)
