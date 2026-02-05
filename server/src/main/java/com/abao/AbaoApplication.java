package com.abao;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cache.annotation.EnableCaching;

@SpringBootApplication
@EnableCaching
public class AbaoApplication {

    public static void main(String[] args) {
        SpringApplication.run(AbaoApplication.class, args);
    }
}
