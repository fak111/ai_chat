package com.abao.repository;

import com.abao.entity.Message;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface MessageRepository extends JpaRepository<Message, UUID> {

    Page<Message> findByGroupIdOrderByCreatedAtDesc(UUID groupId, Pageable pageable);

    @Query("SELECT m FROM Message m LEFT JOIN FETCH m.sender WHERE m.group.id = :groupId ORDER BY m.createdAt DESC LIMIT :limit")
    List<Message> findRecentByGroupId(@Param("groupId") UUID groupId, @Param("limit") int limit);

    @Query("SELECT m FROM Message m LEFT JOIN FETCH m.sender WHERE m.group.id = :groupId AND m.createdAt >= :since ORDER BY m.createdAt ASC LIMIT :limit")
    List<Message> findContextWindow(@Param("groupId") UUID groupId, @Param("since") LocalDateTime since, @Param("limit") int limit);

    @Query("SELECT m FROM Message m WHERE m.group.id = :groupId ORDER BY m.createdAt DESC LIMIT 1")
    Optional<Message> findLatestByGroupId(@Param("groupId") UUID groupId);

    long countByGroupId(UUID groupId);
}
