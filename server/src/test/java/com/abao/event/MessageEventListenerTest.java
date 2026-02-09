package com.abao.event;

import org.junit.jupiter.api.Test;
import org.springframework.scheduling.annotation.Async;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.transaction.event.TransactionPhase;

import java.lang.reflect.Method;

import static org.assertj.core.api.Assertions.*;

/**
 * Tests for MessageEventListener — verifies S3 and S4 annotations.
 */
class MessageEventListenerTest {

    @Test
    void handleMessageSent_ShouldUseTransactionalEventListener() throws NoSuchMethodException {
        // S3: Should use @TransactionalEventListener(AFTER_COMMIT) instead of @EventListener
        Method method = MessageEventListener.class.getMethod("handleMessageSent", MessageSentEvent.class);

        TransactionalEventListener annotation = method.getAnnotation(TransactionalEventListener.class);
        assertThat(annotation).isNotNull();
        assertThat(annotation.phase()).isEqualTo(TransactionPhase.AFTER_COMMIT);
    }

    @Test
    void handleMessageSent_ShouldNotHaveEventListenerAnnotation() throws NoSuchMethodException {
        // S3: Should NOT have @EventListener (replaced by @TransactionalEventListener)
        Method method = MessageEventListener.class.getMethod("handleMessageSent", MessageSentEvent.class);

        var eventListener = method.getAnnotation(org.springframework.context.event.EventListener.class);
        assertThat(eventListener).isNull();
    }

    @Test
    void handleMessageSent_ShouldHaveAsyncAnnotation() throws NoSuchMethodException {
        // The listener itself should keep @Async (S4 removes @Async from AIService, not here)
        Method method = MessageEventListener.class.getMethod("handleMessageSent", MessageSentEvent.class);

        Async asyncAnnotation = method.getAnnotation(Async.class);
        assertThat(asyncAnnotation).isNotNull();
    }
}
