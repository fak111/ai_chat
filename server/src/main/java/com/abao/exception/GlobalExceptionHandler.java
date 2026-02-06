package com.abao.exception;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.HashMap;
import java.util.Map;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(RuntimeException.class)
    public ResponseEntity<Map<String, String>> handleRuntimeException(RuntimeException e) {
        log.warn("业务异常: {}", e.getMessage());

        Map<String, String> response = new HashMap<>();
        response.put("error", e.getMessage());

        HttpStatus status = determineStatus(e.getMessage());
        return ResponseEntity.status(status).body(response);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidationException(MethodArgumentNotValidException e) {
        Map<String, Object> response = new HashMap<>();
        Map<String, String> errors = new HashMap<>();

        for (FieldError error : e.getBindingResult().getFieldErrors()) {
            errors.put(error.getField(), error.getDefaultMessage());
        }

        response.put("error", "参数验证失败");
        response.put("details", errors);

        return ResponseEntity.badRequest().body(response);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> handleGenericException(Exception e) {
        log.error("未处理的异常", e);

        Map<String, String> response = new HashMap<>();
        response.put("error", "服务器内部错误");

        return ResponseEntity.internalServerError().body(response);
    }

    private HttpStatus determineStatus(String message) {
        if (message == null) {
            return HttpStatus.BAD_REQUEST;
        }

        // 401 - Unauthorized (check first, before 404)
        if (message.contains("密码错误") || message.contains("请先验证") || message.contains("已过期")
            || message.contains("令牌") || message.contains("token")) {
            return HttpStatus.UNAUTHORIZED;
        }

        // 404 - Not Found
        if (message.contains("不存在") || message.contains("无效") || message.contains("找不到")) {
            return HttpStatus.NOT_FOUND;
        }

        // 409 - Conflict
        if (message.contains("已注册") || message.contains("已在") || message.contains("已存在")) {
            return HttpStatus.CONFLICT;
        }

        // 403 - Forbidden
        if (message.contains("不是") && message.contains("成员")) {
            return HttpStatus.FORBIDDEN;
        }

        // 400 - Bad Request (default)
        return HttpStatus.BAD_REQUEST;
    }
}
