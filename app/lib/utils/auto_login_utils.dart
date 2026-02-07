/// Parse auto_login URL parameter. Format: "email:password"
/// Splits at first colon only (passwords may contain colons).
/// Returns null if input is invalid.
({String email, String password})? parseAutoLoginParam(String? value) {
  if (value == null || !value.contains(':')) return null;
  final colonIndex = value.indexOf(':');
  final email = value.substring(0, colonIndex);
  final password = value.substring(colonIndex + 1);
  if (email.isEmpty || password.isEmpty) return null;
  return (email: email, password: password);
}

/// Extract auto_login value from a URI, checking both regular query params
/// and the hash fragment (Flutter web uses hash-based routing, so params
/// like /#/?auto_login=... end up in the fragment, not queryParameters).
String? extractAutoLoginFromUri(Uri uri) {
  // First try regular query parameters: ?auto_login=...
  final fromQuery = uri.queryParameters['auto_login'];
  if (fromQuery != null) return fromQuery;

  // Then try hash fragment: #/?auto_login=... or #/route?auto_login=...
  final fragment = uri.fragment;
  if (fragment.isEmpty) return null;
  final qIndex = fragment.indexOf('?');
  if (qIndex < 0) return null;
  final fragmentQuery = Uri.splitQueryString(fragment.substring(qIndex + 1));
  return fragmentQuery['auto_login'];
}
