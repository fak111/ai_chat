package com.abao.websocket;

import com.abao.entity.User;
import com.abao.repository.UserRepository;
import com.abao.security.JwtTokenProvider;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;
import org.springframework.web.util.UriComponentsBuilder;

import java.util.Map;
import java.util.UUID;

@Slf4j
@Component
@RequiredArgsConstructor
public class JwtHandshakeInterceptor implements HandshakeInterceptor {

    private final JwtTokenProvider jwtTokenProvider;
    private final UserRepository userRepository;

    @Override
    public boolean beforeHandshake(
        ServerHttpRequest request,
        ServerHttpResponse response,
        WebSocketHandler wsHandler,
        Map<String, Object> attributes
    ) {
        String token = extractToken(request);

        if (token == null) {
            log.warn("WebSocket rejected - no token provided in request");
            return false;
        }

        try {
            UUID userId = jwtTokenProvider.getUserIdFromToken(token);
            User user = userRepository.findById(userId).orElse(null);

            if (user == null) {
                log.warn("WebSocket rejected - user not found for id={}", userId);
                return false;
            }

            attributes.put("user", user);
            attributes.put("userId", userId);
            return true;
        } catch (ExpiredJwtException e) {
            log.warn("WebSocket rejected - token expired at {}, user={}",
                e.getClaims().getExpiration(), e.getClaims().getSubject());
            return false;
        } catch (JwtException e) {
            log.warn("WebSocket rejected - invalid token: {}", e.getMessage());
            return false;
        } catch (Exception e) {
            log.error("WebSocket rejected - unexpected error during handshake", e);
            return false;
        }
    }

    @Override
    public void afterHandshake(
        ServerHttpRequest request,
        ServerHttpResponse response,
        WebSocketHandler wsHandler,
        Exception exception
    ) {
        // Nothing to do
    }

    private String extractToken(ServerHttpRequest request) {
        // Try query parameter first
        String query = request.getURI().getQuery();
        if (query != null) {
            Map<String, String> params = UriComponentsBuilder.fromUriString("?" + query)
                .build()
                .getQueryParams()
                .toSingleValueMap();

            if (params.containsKey("token")) {
                return params.get("token");
            }
        }

        // Try Authorization header
        String authHeader = request.getHeaders().getFirst("Authorization");
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            return authHeader.substring(7);
        }

        return null;
    }
}
