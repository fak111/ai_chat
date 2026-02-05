package com.abao.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;

@Configuration
@EnableAsync
public class AsyncConfig {
    // Default thread pool configuration is sufficient for MVP
    // Can be customized later if needed
}
