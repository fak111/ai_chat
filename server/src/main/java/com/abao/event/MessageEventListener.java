package com.abao.event;

import com.abao.service.AIService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class MessageEventListener {

    private final AIService aiService;

    @Async
    @EventListener
    public void handleMessageSent(MessageSentEvent event) {
        log.debug("Processing message event: {}", event.getMessage().getId());
        aiService.processMessage(event.getMessage());
    }
}
