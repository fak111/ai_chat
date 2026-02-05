package com.abao.repository;

import com.abao.entity.Group;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface GroupRepository extends JpaRepository<Group, UUID> {

    Optional<Group> findByInviteCode(String inviteCode);

    boolean existsByInviteCode(String inviteCode);

    @Query("SELECT g FROM Group g JOIN g.members m WHERE m.user.id = :userId ORDER BY g.updatedAt DESC")
    List<Group> findByUserIdOrderByUpdatedAtDesc(@Param("userId") UUID userId);
}
