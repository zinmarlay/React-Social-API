import express from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";

export const router = express.Router();

import { auth } from "../middlewares/auth";

function getUserId(req: express.Request) {
    const token = req.headers.authorization?.split(" ")[1];
    if(!token) return undefined;

    try {
        const data = jwt.verify(token, process.env.JWT_SECRET as string) as { id?: number };
        return data.id;
    } catch(e) {
        return undefined;
    }
}

function formatPost(post: any, userId?: number) {
    const liked = userId ? post.likes?.some((like: any) => like.userId === userId) : false;

    return {
        ...post,
        likesCount: post._count?.likes || 0,
        liked,
        likes: undefined,
        _count: undefined,
    };
}

router.get("/posts", async (req, res) => {
    const userId = getUserId(req);
    const posts = await prisma.post.findMany({
        orderBy: { id: "desc" },
        take: 20,
        include: {
            user: true,
            comments: {
                include: {
                    user: true,
                }
            },
            ...(userId ? {
                likes: {
                    where: { userId },
                    select: { userId: true },
                }
            } : {}),
            _count: {
                select: {
                    likes: true,
                }
            },
        }
    });

    res.json(posts.map(post => formatPost(post, userId)));
});

router.post("/posts", auth, async (req, res) => {
    const id = res.locals.user.id;

    const content = req.body?.content;
    if(!content) {
        return res.status(400).json({ msg: "content is required" });
    }

    const post = await prisma.post.create({
        data: {
            content,
            userId: id
        }
    });

    res.status(201).json(post);
});

router.get("/posts/:id", async (req, res) => {
    const userId = getUserId(req);
    const id = req.params?.id;
    const post = await prisma.post.findUnique({
        where: {
            id: Number(id),
        },
        include: {
            user: true,
            comments: {
                include: {
                    user: true,
                }
            },
            ...(userId ? {
                likes: {
                    where: { userId },
                    select: { userId: true },
                }
            } : {}),
            _count: {
                select: {
                    likes: true,
                }
            },
        }
    });

    if(!post) {
        return res.status(404).json({ msg: "post not found" });
    }

    res.json(formatPost(post, userId));
});

router.delete("/posts/:id", auth, async (req, res) => {
    const userId = res.locals.user.id as number;
    const id = Number(req.params?.id);

    if(!Number.isInteger(id)) {
        return res.status(400).json({ msg: "invalid post id" });
    }

    const post = await prisma.post.findUnique({
        where: { id },
    });

    if(!post) {
        return res.status(404).json({ msg: "post not found" });
    }

    if(post.userId !== userId) {
        return res.status(403).json({ msg: "only owner can delete post" });
    }

    await prisma.$transaction([
        prisma.like.deleteMany({
            where: { postId: id },
        }),
        prisma.comment.deleteMany({
            where: { postId: id },
        }),
        prisma.post.delete({
            where: { id },
        }),
    ]);

    res.status(204).send();
});

router.post("/posts/:id/likes", auth, async (req, res) => {
    const userId = res.locals.user.id as number;
    const postId = Number(req.params?.id);

    if(!Number.isInteger(postId)) {
        return res.status(400).json({ msg: "invalid post id" });
    }

    const post = await prisma.post.findUnique({
        where: { id: postId },
    });

    if(!post) {
        return res.status(404).json({ msg: "post not found" });
    }

    const like = await prisma.like.findUnique({
        where: {
            userId_postId: {
                userId,
                postId,
            }
        },
    });

    if(like) {
        await prisma.like.delete({
            where: { id: like.id },
        });
    } else {
        await prisma.like.create({
            data: {
                userId,
                postId,
            },
        });
    }

    const likesCount = await prisma.like.count({
        where: { postId },
    });

    res.json({
        liked: !like,
        likesCount,
    });
});

router.post("/posts/:id/comments", auth, async (req, res) => {
    const userId = res.locals.user.id as number;
    const postId = Number(req.params?.id);
    const content = req.body?.content;

    if(!Number.isInteger(postId)) {
        return res.status(400).json({ msg: "invalid post id" });
    }

    if(!content) {
        return res.status(400).json({ msg: "content is required" });
    }

    const post = await prisma.post.findUnique({
        where: { id: postId },
    });

    if(!post) {
        return res.status(404).json({ msg: "post not found" });
    }

    const comment = await prisma.comment.create({
        data: {
            content,
            postId,
            userId,
        },
        include: {
            user: true,
        }
    });

    res.status(201).json(comment);
});

router.delete("/comments/:id", auth, async (req, res) => {
    const userId = res.locals.user.id as number;
    const id = Number(req.params?.id);

    if(!Number.isInteger(id)) {
        return res.status(400).json({ msg: "invalid comment id" });
    }

    const comment = await prisma.comment.findUnique({
        where: { id },
    });

    if(!comment) {
        return res.status(404).json({ msg: "comment not found" });
    }

    if(comment.userId !== userId) {
        return res.status(403).json({ msg: "only owner can delete comment" });
    }

    await prisma.comment.delete({
        where: { id },
    });

    res.status(204).send();
});
