package com.abao.config;

import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import static org.assertj.core.api.Assertions.*;

/**
 * Tests for RestTemplateConfig — verifies S9.
 */
class RestTemplateConfigTest {

    @Test
    void restTemplateConfigClass_Exists() {
        // S9: RestTemplateConfig class should exist
        assertThatCode(() -> Class.forName("com.abao.config.RestTemplateConfig"))
            .doesNotThrowAnyException();
    }

    @Test
    void restTemplateConfigClass_HasConfigurationAnnotation() throws ClassNotFoundException {
        Class<?> clazz = Class.forName("com.abao.config.RestTemplateConfig");
        assertThat(clazz.getAnnotation(Configuration.class)).isNotNull();
    }

    @Test
    void restTemplateConfigClass_HasAiRestTemplateBean() throws ClassNotFoundException {
        Class<?> clazz = Class.forName("com.abao.config.RestTemplateConfig");

        // Should have a method annotated with @Bean("aiRestTemplate")
        boolean hasBeanMethod = false;
        for (var method : clazz.getDeclaredMethods()) {
            Bean beanAnnotation = method.getAnnotation(Bean.class);
            if (beanAnnotation != null) {
                for (String name : beanAnnotation.value()) {
                    if ("aiRestTemplate".equals(name)) {
                        hasBeanMethod = true;
                        break;
                    }
                }
            }
        }
        assertThat(hasBeanMethod).isTrue();
    }
}
